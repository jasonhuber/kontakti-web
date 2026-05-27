<?php

namespace App\Services;

use App\Models\{Person, PersonEmail, PersonPhone};
use Illuminate\Support\Facades\DB;

class PersonContactSync
{
    private const EMAIL_LABELS = ['work', 'home', 'personal', 'other'];
    private const PHONE_LABELS = ['mobile', 'work', 'home', 'other'];

    /**
     * Replace all emails + phones for the given person with the provided lists.
     *
     * Each entry: ['value' => string, 'label' => ?string, 'is_primary' => ?bool]
     * - At least one email/phone is marked primary; if none flagged, the first wins.
     * - Duplicates collapsed case-insensitively (emails) or by digits-only (phones).
     * - After write, mirrors primaries onto the legacy people.email / people.phone columns.
     *
     * Pass null for either list to leave that side untouched.
     */
    public function apply(Person $person, ?array $emails, ?array $phones): void
    {
        DB::transaction(function () use ($person, $emails, $phones) {
            if ($emails !== null) {
                $this->replaceEmails($person, $emails);
            }
            if ($phones !== null) {
                $this->replacePhones($person, $phones);
            }

            $person->load(['emails', 'phones']);
            $person->syncPrimaryContactColumns();
            $person->save();
        });
    }

    private function replaceEmails(Person $person, array $emails): void
    {
        $clean = [];
        $seen  = [];
        foreach ($emails as $row) {
            if (!is_array($row)) continue;
            $value = isset($row['value']) ? trim((string) $row['value']) : '';
            if ($value === '') continue;
            $key = strtolower($value);
            if (isset($seen[$key])) continue;
            $seen[$key] = true;

            $label = strtolower((string) ($row['label'] ?? 'other'));
            if (!in_array($label, self::EMAIL_LABELS, true)) $label = 'other';

            $clean[] = [
                'value'      => $value,
                'label'      => $label,
                'is_primary' => (bool) ($row['is_primary'] ?? false),
            ];
        }

        // Promote first to primary if none flagged.
        if (!empty($clean)) {
            $anyPrimary = false;
            foreach ($clean as $r) {
                if ($r['is_primary']) { $anyPrimary = true; break; }
            }
            if (!$anyPrimary) {
                $clean[0]['is_primary'] = true;
            } else {
                // Only one primary allowed; keep the first flagged.
                $found = false;
                foreach ($clean as $i => $r) {
                    if ($r['is_primary'] && !$found) { $found = true; continue; }
                    if ($r['is_primary'] && $found) { $clean[$i]['is_primary'] = false; }
                }
            }
        }

        $person->emails()->delete();
        foreach ($clean as $r) {
            $person->emails()->create($r);
        }
    }

    private function replacePhones(Person $person, array $phones): void
    {
        $clean = [];
        $seen  = [];
        foreach ($phones as $row) {
            if (!is_array($row)) continue;
            $value = isset($row['value']) ? trim((string) $row['value']) : '';
            if ($value === '') continue;
            $digits = preg_replace('/\D+/', '', $value);
            $key = $digits !== '' ? $digits : strtolower($value);
            if (isset($seen[$key])) continue;
            $seen[$key] = true;

            $label = strtolower((string) ($row['label'] ?? 'mobile'));
            if (!in_array($label, self::PHONE_LABELS, true)) $label = 'mobile';

            $clean[] = [
                'value'      => $value,
                'label'      => $label,
                'is_primary' => (bool) ($row['is_primary'] ?? false),
            ];
        }

        if (!empty($clean)) {
            $anyPrimary = false;
            foreach ($clean as $r) {
                if ($r['is_primary']) { $anyPrimary = true; break; }
            }
            if (!$anyPrimary) {
                $clean[0]['is_primary'] = true;
            } else {
                $found = false;
                foreach ($clean as $i => $r) {
                    if ($r['is_primary'] && !$found) { $found = true; continue; }
                    if ($r['is_primary'] && $found) { $clean[$i]['is_primary'] = false; }
                }
            }
        }

        $person->phones()->delete();
        foreach ($clean as $r) {
            $person->phones()->create($r);
        }
    }
}
