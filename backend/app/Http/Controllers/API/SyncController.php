<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{Person, Company, Discussion, Note, Task, PersonPhoto, UserGoogleAccount};
use App\Services\PersonContactSync;
use Illuminate\Http\{Request, JsonResponse};
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Delta-sync endpoint for offline-first mobile clients.
 *
 * GET  /api/v1/sync   — pull everything the user owns changed after ?since (full snapshot if omitted).
 * POST /api/v1/sync   — push batched client upserts/deletes; last-write-wins, fully tenant-scoped.
 *
 * Additive: shares zero behaviour with the existing CRUD controllers.
 */
class SyncController extends Controller
{
    /** Types the client may push. person/company/discussion/note/task only. */
    private const PUSHABLE = ['people', 'companies', 'discussions', 'notes', 'tasks'];

    // — PULL —————————————————————————————————————————————————————————————

    public function pull(Request $request): JsonResponse
    {
        $userId = auth()->id();
        $since  = $this->parseSince($request->get('since'));

        return response()->json([
            'server_time'      => now()->toISOString(),
            'people'           => $this->pullPeople($userId, $since),
            'companies'        => $this->pullSimple(Company::class, $userId, $since, fn($m) => $this->serializeCompany($m)),
            'discussions'      => $this->pullDiscussions($userId, $since),
            'notes'            => $this->pullSimple(Note::class, $userId, $since, fn($m) => $this->serializeNote($m)),
            'tasks'            => $this->pullSimple(Task::class, $userId, $since, fn($m) => $this->serializeTask($m)),
            'tags'             => $this->pullTags($userId, $since),
            'person_photos'    => $this->pullPersonPhotos($userId, $since),
            'google_accounts'  => $this->pullGoogleAccounts($userId, $since),
        ]);
    }

    private function pullPeople(int $userId, ?Carbon $since): array
    {
        return Person::withTrashed()
            ->where('user_id', $userId)
            ->with(['emails', 'phones'])
            ->when($since, fn($q) => $q->where('updated_at', '>', $since))
            ->get()
            ->map(fn(Person $p) => $this->serializePerson($p))
            ->all();
    }

    private function pullDiscussions(int $userId, ?Carbon $since): array
    {
        return Discussion::withTrashed()
            ->where('user_id', $userId)
            ->with('participants:id')
            ->when($since, fn($q) => $q->where('updated_at', '>', $since))
            ->get()
            ->map(fn(Discussion $d) => $this->serializeDiscussion($d))
            ->all();
    }

    /** Shared puller for soft-deleting, user-scoped models. */
    private function pullSimple(string $modelClass, int $userId, ?Carbon $since, callable $serializer): array
    {
        return $modelClass::withTrashed()
            ->where('user_id', $userId)
            ->when($since, fn($q) => $q->where('updated_at', '>', $since))
            ->get()
            ->map($serializer)
            ->all();
    }

    private function pullTags(int $userId, ?Carbon $since): array
    {
        // Tags do not soft-delete; just user-scoped + updated_at delta.
        return \App\Models\Tag::where('user_id', $userId)
            ->when($since, fn($q) => $q->where('updated_at', '>', $since))
            ->get()
            ->map(fn($t) => $this->serializeTag($t))
            ->all();
    }

    private function pullPersonPhotos(int $userId, ?Carbon $since): array
    {
        // person_photos has no user_id — scope via the owning person.
        return PersonPhoto::whereIn('person_id', Person::where('user_id', $userId)->select('id'))
            ->when($since, fn($q) => $q->where('updated_at', '>', $since))
            ->get()
            ->map(fn($photo) => $this->serializePersonPhoto($photo))
            ->all();
    }

    private function pullGoogleAccounts(int $userId, ?Carbon $since): array
    {
        return UserGoogleAccount::where('user_id', $userId)
            ->when($since, fn($q) => $q->where('updated_at', '>', $since))
            ->get()
            ->map(fn($a) => $this->serializeGoogleAccount($a))
            ->all();
    }

    private function parseSince($since): ?Carbon
    {
        if (empty($since) || !is_string($since)) {
            return null;
        }
        try {
            return Carbon::parse($since);
        } catch (\Throwable) {
            return null;
        }
    }

    // — PUSH —————————————————————————————————————————————————————————————

    public function push(Request $request, PersonContactSync $contactSync): JsonResponse
    {
        $userId = auth()->id();

        $applied   = ['people' => [], 'companies' => [], 'discussions' => [], 'notes' => [], 'tasks' => []];
        $conflicts = ['people' => [], 'companies' => [], 'discussions' => [], 'notes' => [], 'tasks' => []];

        foreach (self::PUSHABLE as $type) {
            $records = $request->input($type);
            if (!is_array($records) || empty($records)) {
                continue;
            }

            // One transaction per entity-type batch so a partial failure
            // doesn't half-apply that type.
            DB::transaction(function () use ($type, $records, $userId, $contactSync, &$applied, &$conflicts) {
                foreach ($records as $record) {
                    if (!is_array($record) || empty($record['id'])) {
                        continue;
                    }

                    [$status, $model] = match ($type) {
                        'people'      => $this->pushPerson($record, $userId, $contactSync),
                        'companies'   => $this->pushCompany($record, $userId),
                        'discussions' => $this->pushDiscussion($record, $userId),
                        'notes'       => $this->pushNote($record, $userId),
                        'tasks'       => $this->pushTask($record, $userId),
                    };

                    if ($model === null) {
                        continue; // no-op (delete of nonexistent, etc.)
                    }

                    $serialized = match ($type) {
                        'people'      => $this->serializePerson($model),
                        'companies'   => $this->serializeCompany($model),
                        'discussions' => $this->serializeDiscussion($model),
                        'notes'       => $this->serializeNote($model),
                        'tasks'       => $this->serializeTask($model),
                    };

                    if ($status === 'conflict') {
                        $conflicts[$type][] = $serialized;
                    } else {
                        $applied[$type][] = $serialized;
                    }
                }
            });
        }

        return response()->json([
            'server_time' => now()->toISOString(),
            'applied'     => $applied,
            'conflicts'   => $conflicts,
        ]);
    }

    /**
     * Resolve the LWW decision for an incoming record.
     *
     * Returns one of: 'create', 'apply', 'conflict', 'noop'.
     * On 'noop' the model is null; on 'conflict' it's the current server model.
     */
    private function resolve(?Model $existing, array $record): array
    {
        $deleted    = (bool) ($record['_deleted'] ?? false);
        $clientTime = $this->parseSince($record['updated_at'] ?? null);

        if ($existing === null) {
            // No server row: create unless this is a delete (nothing to delete).
            return $deleted ? ['noop', null] : ['create', $clientTime];
        }

        // Server wins when its updated_at is strictly newer than the client's.
        if ($clientTime !== null && $existing->updated_at !== null && $clientTime->lt($existing->updated_at)) {
            return ['conflict', $clientTime];
        }

        return ['apply', $clientTime];
    }

    /** Persist a model's updated_at to the client's edit time without bumping it again. */
    private function stampUpdatedAt(Model $model, ?Carbon $clientTime): void
    {
        if ($clientTime === null) {
            return;
        }
        $model->timestamps = false;
        $model->updated_at = $clientTime;
        $model->save();
        $model->timestamps = true;
    }

    private function pushPerson(array $record, int $userId, PersonContactSync $contactSync): array
    {
        /** @var Person|null $existing */
        $existing = Person::withTrashed()->where('id', $record['id'])->where('user_id', $userId)->first();
        [$decision, $clientTime] = $this->resolve($existing, $record);

        if ($decision === 'noop') {
            return ['noop', null];
        }
        if ($decision === 'conflict') {
            return ['conflict', $existing->load(['emails', 'phones'])];
        }

        $fields = $this->personFields($record, $userId);

        if ($decision === 'create') {
            $person = new Person($fields);
            $person->id      = $record['id'];
            $person->user_id = $userId;
            $person->save();
        } else {
            $person = $existing;
            if ($person->trashed()) {
                $person->restore();
            }
            $person->fill($fields);
            $person->save();
        }

        // Soft-delete request always wins the body (LWW already decided apply).
        if (!empty($record['_deleted'])) {
            $this->stampUpdatedAt($person, $clientTime);
            $person->delete();
            return [$decision === 'create' ? 'applied' : 'applied', $person->load(['emails', 'phones'])];
        }

        // Reconcile nested emails[] / phones[] the same way PeopleController@update does.
        $emails = array_key_exists('emails', $record) && is_array($record['emails']) ? $record['emails'] : null;
        $phones = array_key_exists('phones', $record) && is_array($record['phones']) ? $record['phones'] : null;
        if ($emails !== null || $phones !== null) {
            $contactSync->apply($person, $emails, $phones);
        }

        $this->stampUpdatedAt($person, $clientTime);

        return ['applied', $person->load(['emails', 'phones'])];
    }

    private function pushCompany(array $record, int $userId): array
    {
        /** @var Company|null $existing */
        $existing = Company::withTrashed()->where('id', $record['id'])->where('user_id', $userId)->first();
        [$decision, $clientTime] = $this->resolve($existing, $record);

        if ($decision === 'noop') {
            return ['noop', null];
        }
        if ($decision === 'conflict') {
            return ['conflict', $existing];
        }

        $fields = $this->scalarFields($record, [
            'name', 'domain', 'logo_url', 'industry', 'size_range',
            'linkedin_url', 'website', 'notes', 'metadata',
        ]);

        if ($decision === 'create') {
            $company = new Company($fields);
            $company->id      = $record['id'];
            $company->user_id = $userId;
            $company->save();
        } else {
            $company = $existing;
            if ($company->trashed()) {
                $company->restore();
            }
            $company->fill($fields);
            $company->save();
        }

        if (!empty($record['_deleted'])) {
            $this->stampUpdatedAt($company, $clientTime);
            $company->delete();
            return ['applied', $company];
        }

        $this->stampUpdatedAt($company, $clientTime);
        return ['applied', $company];
    }

    private function pushDiscussion(array $record, int $userId): array
    {
        /** @var Discussion|null $existing */
        $existing = Discussion::withTrashed()->where('id', $record['id'])->where('user_id', $userId)->first();
        [$decision, $clientTime] = $this->resolve($existing, $record);

        if ($decision === 'noop') {
            return ['noop', null];
        }
        if ($decision === 'conflict') {
            return ['conflict', $existing->load('participants:id')];
        }

        $fields = $this->scalarFields($record, ['title', 'date', 'type', 'summary', 'body', 'metadata']);

        if ($decision === 'create') {
            $discussion = new Discussion($fields);
            $discussion->id      = $record['id'];
            $discussion->user_id = $userId;
            $discussion->save();
        } else {
            $discussion = $existing;
            if ($discussion->trashed()) {
                $discussion->restore();
            }
            $discussion->fill($fields);
            $discussion->save();
        }

        if (!empty($record['_deleted'])) {
            $this->stampUpdatedAt($discussion, $clientTime);
            $discussion->delete();
            return ['applied', $discussion->load('participants:id')];
        }

        // Sync participants, but only ids that belong to this user.
        if (array_key_exists('participant_ids', $record) && is_array($record['participant_ids'])) {
            $ids = Person::whereIn('id', $record['participant_ids'])
                ->where('user_id', $userId)
                ->pluck('id')
                ->all();
            $discussion->participants()->sync($ids);
        }

        $this->stampUpdatedAt($discussion, $clientTime);
        return ['applied', $discussion->load('participants:id')];
    }

    private function pushNote(array $record, int $userId): array
    {
        /** @var Note|null $existing */
        $existing = Note::withTrashed()->where('id', $record['id'])->where('user_id', $userId)->first();
        [$decision, $clientTime] = $this->resolve($existing, $record);

        if ($decision === 'noop') {
            return ['noop', null];
        }
        if ($decision === 'conflict') {
            return ['conflict', $existing];
        }

        $fields = $this->scalarFields($record, ['title', 'body', 'metadata']);
        // notable_* is a validated, tenant-scoped reference (drop if foreign).
        [$notableType, $notableId] = $this->resolveNotable($record, $userId);
        $fields['notable_type'] = $notableType;
        $fields['notable_id']   = $notableId;

        if ($decision === 'create') {
            $note = new Note($fields);
            $note->id      = $record['id'];
            $note->user_id = $userId;
            $note->save();
        } else {
            $note = $existing;
            if ($note->trashed()) {
                $note->restore();
            }
            $note->fill($fields);
            $note->save();
        }

        if (!empty($record['_deleted'])) {
            $this->stampUpdatedAt($note, $clientTime);
            $note->delete();
            return ['applied', $note];
        }

        $this->stampUpdatedAt($note, $clientTime);
        return ['applied', $note];
    }

    private function pushTask(array $record, int $userId): array
    {
        /** @var Task|null $existing */
        $existing = Task::withTrashed()->where('id', $record['id'])->where('user_id', $userId)->first();
        [$decision, $clientTime] = $this->resolve($existing, $record);

        if ($decision === 'noop') {
            return ['noop', null];
        }
        if ($decision === 'conflict') {
            return ['conflict', $existing];
        }

        $fields = $this->scalarFields($record, ['title', 'description', 'due_at', 'completed_at', 'priority']);
        [$taskableType, $taskableId] = $this->resolveTaskable($record, $userId);
        $fields['taskable_type'] = $taskableType;
        $fields['taskable_id']   = $taskableId;

        if ($decision === 'create') {
            $task = new Task($fields);
            $task->id      = $record['id'];
            $task->user_id = $userId;
            $task->save();
        } else {
            $task = $existing;
            if ($task->trashed()) {
                $task->restore();
            }
            $task->fill($fields);
            $task->save();
        }

        if (!empty($record['_deleted'])) {
            $this->stampUpdatedAt($task, $clientTime);
            $task->delete();
            return ['applied', $task];
        }

        $this->stampUpdatedAt($task, $clientTime);
        return ['applied', $task];
    }

    // — Field assembly —————————————————————————————————————————————————————

    /** Pull only the named keys that are present in the record. */
    private function scalarFields(array $record, array $keys): array
    {
        $out = [];
        foreach ($keys as $key) {
            if (array_key_exists($key, $record)) {
                $out[$key] = $record[$key];
            }
        }
        return $out;
    }

    private function personFields(array $record, int $userId): array
    {
        $fields = $this->scalarFields($record, [
            'first_name', 'last_name', 'nickname', 'email', 'phone',
            'linkedin_url', 'avatar_url', 'title', 'job_department',
            'relationship_strength', 'last_contacted_at', 'next_followup_at',
            'birthday', 'notes', 'device_note', 'addresses', 'urls', 'metadata',
            'do_not_contact', 'do_not_contact_reason',
            'instagram_handle', 'facebook_url', 'twitter_x_handle', 'tiktok_handle',
            'whatsapp_phone', 'previous_employers', 'city', 'region', 'country',
            'how_we_met',
        ]);

        // FK references: keep only ids owned by this user, else null.
        if (array_key_exists('company_id', $record)) {
            $fields['company_id'] = $this->ownedId(Company::class, $record['company_id'], $userId);
        }
        if (array_key_exists('introduced_by_id', $record)) {
            $fields['introduced_by_id'] = $this->ownedId(Person::class, $record['introduced_by_id'], $userId);
        }

        return $fields;
    }

    /** Return the id only if a row with that id is owned by the user; else null. */
    private function ownedId(string $modelClass, $id, int $userId): ?string
    {
        if (empty($id) || !is_string($id)) {
            return null;
        }
        $exists = $modelClass::where('id', $id)->where('user_id', $userId)->exists();
        return $exists ? $id : null;
    }

    /** notable must be a Person owned by the user (only polymorphic target synced). */
    private function resolveNotable(array $record, int $userId): array
    {
        $type = $record['notable_type'] ?? null;
        $id   = $record['notable_id'] ?? null;
        if ($type === Person::class && $this->ownedId(Person::class, $id, $userId)) {
            return [Person::class, $id];
        }
        return [null, null];
    }

    /** taskable must be a Person owned by the user. */
    private function resolveTaskable(array $record, int $userId): array
    {
        $type = $record['taskable_type'] ?? null;
        $id   = $record['taskable_id'] ?? null;
        if ($type === Person::class && $this->ownedId(Person::class, $id, $userId)) {
            return [Person::class, $id];
        }
        return [null, null];
    }

    // — Serializers ————————————————————————————————————————————————————————

    private function serializePerson(Person $p): array
    {
        return [
            'id'                    => $p->id,
            'user_id'               => $p->user_id,
            'first_name'            => $p->first_name,
            'last_name'             => $p->last_name,
            'nickname'              => $p->nickname,
            'email'                 => $p->email,
            'phone'                 => $p->phone,
            'linkedin_url'          => $p->linkedin_url,
            'avatar_url'            => $p->avatar_url,
            'company_id'            => $p->company_id,
            'title'                 => $p->title,
            'job_department'        => $p->job_department,
            'relationship_strength' => $p->relationship_strength,
            'last_contacted_at'     => $this->iso($p->last_contacted_at),
            'next_followup_at'      => $this->iso($p->next_followup_at),
            'birthday'              => $this->iso($p->birthday),
            'notes'                 => $p->notes,
            'device_note'           => $p->device_note,
            'addresses'             => $p->addresses,
            'urls'                  => $p->urls,
            'metadata'              => $p->metadata,
            'do_not_contact'        => (bool) $p->do_not_contact,
            'do_not_contact_reason' => $p->do_not_contact_reason,
            'instagram_handle'      => $p->instagram_handle,
            'facebook_url'          => $p->facebook_url,
            'twitter_x_handle'      => $p->twitter_x_handle,
            'tiktok_handle'         => $p->tiktok_handle,
            'whatsapp_phone'        => $p->whatsapp_phone,
            'previous_employers'    => $p->previous_employers,
            'city'                  => $p->city,
            'region'                => $p->region,
            'country'               => $p->country,
            'how_we_met'            => $p->how_we_met,
            'introduced_by_id'      => $p->introduced_by_id,
            'emails'                => $p->emails->map(fn($e) => [
                'id'         => $e->id,
                'value'      => $e->value,
                'label'      => $e->label,
                'is_primary' => (bool) $e->is_primary,
            ])->all(),
            'phones'                => $p->phones->map(fn($ph) => [
                'id'         => $ph->id,
                'value'      => $ph->value,
                'label'      => $ph->label,
                'is_primary' => (bool) $ph->is_primary,
            ])->all(),
            'created_at'            => $this->iso($p->created_at),
            'updated_at'            => $this->iso($p->updated_at),
            'deleted_at'            => $this->iso($p->deleted_at),
        ];
    }

    private function serializeCompany(Company $c): array
    {
        return [
            'id'         => $c->id,
            'user_id'    => $c->user_id,
            'name'       => $c->name,
            'domain'     => $c->domain,
            'logo_url'   => $c->logo_url,
            'industry'   => $c->industry,
            'size_range' => $c->size_range,
            'linkedin_url' => $c->linkedin_url,
            'website'    => $c->website,
            'notes'      => $c->notes,
            'metadata'   => $c->metadata,
            'created_at' => $this->iso($c->created_at),
            'updated_at' => $this->iso($c->updated_at),
            'deleted_at' => $this->iso($c->deleted_at),
        ];
    }

    private function serializeDiscussion(Discussion $d): array
    {
        return [
            'id'              => $d->id,
            'user_id'         => $d->user_id,
            'title'           => $d->title,
            'date'            => $this->iso($d->date),
            'type'            => $d->type,
            'summary'         => $d->summary,
            'body'            => $d->body,
            'metadata'        => $d->metadata,
            'participant_ids' => $d->participants->pluck('id')->all(),
            'created_at'      => $this->iso($d->created_at),
            'updated_at'      => $this->iso($d->updated_at),
            'deleted_at'      => $this->iso($d->deleted_at),
        ];
    }

    private function serializeNote(Note $n): array
    {
        return [
            'id'           => $n->id,
            'user_id'      => $n->user_id,
            'title'        => $n->title,
            'body'         => $n->body,
            'notable_type' => $n->notable_type,
            'notable_id'   => $n->notable_id,
            'metadata'     => $n->metadata,
            'created_at'   => $this->iso($n->created_at),
            'updated_at'   => $this->iso($n->updated_at),
            'deleted_at'   => $this->iso($n->deleted_at),
        ];
    }

    private function serializeTask(Task $t): array
    {
        return [
            'id'            => $t->id,
            'user_id'       => $t->user_id,
            'title'         => $t->title,
            'description'   => $t->description,
            'due_at'        => $this->iso($t->due_at),
            'completed_at'  => $this->iso($t->completed_at),
            'taskable_type' => $t->taskable_type,
            'taskable_id'   => $t->taskable_id,
            'priority'      => $t->priority,
            'created_at'    => $this->iso($t->created_at),
            'updated_at'    => $this->iso($t->updated_at),
            'deleted_at'    => $this->iso($t->deleted_at),
        ];
    }

    private function serializeTag($t): array
    {
        return [
            'id'         => $t->id,
            'user_id'    => $t->user_id,
            'name'       => $t->name,
            'slug'       => $t->slug,
            'color'      => $t->color,
            'created_at' => $this->iso($t->created_at),
            'updated_at' => $this->iso($t->updated_at),
            'deleted_at' => null,
        ];
    }

    private function serializePersonPhoto(PersonPhoto $photo): array
    {
        return [
            'id'         => $photo->id,
            'person_id'  => $photo->person_id,
            'url'        => $photo->url,
            'source'     => $photo->source,
            'is_primary' => (bool) $photo->is_primary,
            'sort_order' => (int) $photo->sort_order,
            'created_at' => $this->iso($photo->created_at),
            'updated_at' => $this->iso($photo->updated_at),
            'deleted_at' => null,
        ];
    }

    private function serializeGoogleAccount(UserGoogleAccount $a): array
    {
        // SECURITY: never expose access_token / refresh_token / token_expires_at.
        return [
            'id'             => $a->id,
            'user_id'        => $a->user_id,
            'google_id'      => $a->google_id,
            'email'          => $a->email,
            'label'          => $a->label,
            'is_primary'     => (bool) $a->is_primary,
            'avatar_url'     => $a->avatar_url,
            'last_synced_at' => $this->iso($a->last_synced_at),
            'created_at'     => $this->iso($a->created_at),
            'updated_at'     => $this->iso($a->updated_at),
            'deleted_at'     => null,
        ];
    }

    /** ISO-8601 with fractional seconds + Z, or null. */
    private function iso($value): ?string
    {
        if ($value === null) {
            return null;
        }
        return $value instanceof Carbon ? $value->toISOString() : Carbon::parse($value)->toISOString();
    }
}
