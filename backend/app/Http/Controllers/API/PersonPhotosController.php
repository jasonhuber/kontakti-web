<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\{Person, PersonPhoto};
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\{DB, Http, Log, Storage};
use Illuminate\Support\Str;

/**
 * Photos attached to a Person. Multiple per contact, one flagged as primary.
 *
 * The primary photo's URL is mirrored into Person.avatar_url so legacy code
 * (PersonCard, search results) keeps working without touching the relation.
 *
 * Files live under storage/app/public/photos/{person_id}/{uuid}.{ext}, served
 * directly by Apache via a public_html/photos -> storage/app/public/photos
 * symlink. Filenames are UUIDs so brute-force discovery isn't viable.
 */
class PersonPhotosController extends Controller
{
    private const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
    private const ALLOWED_MIME = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
        'image/webp', 'image/heic', 'image/heif',
    ];

    public function index(Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);
        return response()->json($person->photos);
    }

    /**
     * Accepts EITHER a multipart file upload (field `file`) OR a base64 data
     * URL / raw URL via JSON (`{ url: "..." }` or `{ data: "data:image/..." }`).
     * iOS/Android can use the file path; web drag-drop/paste uses base64.
     */
    public function store(Request $request, Person $person): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);

        $contents = null;
        $ext      = 'jpg';

        if ($request->hasFile('file')) {
            $upload = $request->file('file');
            $size   = $upload->getSize();
            $mime   = $upload->getMimeType();
            if ($size > self::MAX_UPLOAD_BYTES) {
                return response()->json(['message' => 'File too large (max 10 MB).'], 413);
            }
            if (!in_array($mime, self::ALLOWED_MIME, true)) {
                return response()->json(['message' => "Unsupported image type: {$mime}"], 415);
            }
            $contents = file_get_contents($upload->getRealPath());
            $ext      = $this->extensionForMime($mime, $upload->getClientOriginalExtension());
        } elseif ($request->input('data')) {
            // data URL: "data:image/jpeg;base64,...."
            $data = (string) $request->input('data');
            if (!preg_match('#^data:(image/[a-z0-9.+-]+);base64,(.+)$#i', $data, $m)) {
                return response()->json(['message' => 'Invalid data URL.'], 422);
            }
            $mime    = strtolower($m[1]);
            if (!in_array($mime, self::ALLOWED_MIME, true)) {
                return response()->json(['message' => "Unsupported image type: {$mime}"], 415);
            }
            $contents = base64_decode($m[2], true);
            if ($contents === false) {
                return response()->json(['message' => 'Invalid base64.'], 422);
            }
            if (strlen($contents) > self::MAX_UPLOAD_BYTES) {
                return response()->json(['message' => 'Image too large (max 10 MB).'], 413);
            }
            $ext = $this->extensionForMime($mime);
        } elseif ($request->input('url')) {
            // Remote URL — store as a pointer, don't download. Used for
            // LinkedIn CDN URLs where the photo is already publicly hosted.
            return $this->storePointer($person, $request);
        } else {
            return response()->json(['message' => 'Send a file, data URL, or url.'], 422);
        }

        $photoId  = (string) Str::uuid7();
        $filename = "{$photoId}.{$ext}";
        $relPath  = "photos/{$person->id}/{$filename}";

        Storage::disk('public')->put($relPath, $contents);

        // The public_html/photos symlink → storage/app/public/photos exposes
        // these files at https://kontakti.app/photos/...
        $url = "/photos/{$person->id}/{$filename}";

        return DB::transaction(function () use ($person, $photoId, $url, $request) {
            $isFirst = !$person->photos()->exists();
            $photo = PersonPhoto::create([
                'id'         => $photoId,
                'person_id'  => $person->id,
                'url'        => $url,
                'source'     => $request->input('source', 'manual_upload'),
                'is_primary' => $isFirst,
                'sort_order' => ($person->photos()->max('sort_order') ?? 0) + 1,
            ]);
            if ($isFirst) {
                Person::where('id', $person->id)->update(['avatar_url' => $url]);
            }
            return response()->json($photo, 201);
        });
    }

    public function destroy(Person $person, PersonPhoto $photo): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);
        abort_if($photo->person_id !== $person->id, 404);

        return DB::transaction(function () use ($person, $photo) {
            $wasPrimary = $photo->is_primary;
            $url        = $photo->url;

            // Delete the stored file, if it's one we own (starts with /photos/).
            if (str_starts_with($url, '/photos/')) {
                $relPath = ltrim(substr($url, strlen('/photos/')), '/');
                Storage::disk('public')->delete("photos/{$relPath}");
            }
            $photo->delete();

            if ($wasPrimary) {
                // Promote the next-oldest photo as primary; mirror its URL to
                // avatar_url. If no photos left, clear avatar_url.
                $next = $person->photos()->oldest('sort_order')->first();
                if ($next) {
                    $next->update(['is_primary' => true]);
                    Person::where('id', $person->id)->update(['avatar_url' => $next->url]);
                } else {
                    Person::where('id', $person->id)->update(['avatar_url' => null]);
                }
            }

            return response()->json(['deleted' => true]);
        });
    }

    public function setPrimary(Person $person, PersonPhoto $photo): JsonResponse
    {
        abort_if($person->user_id !== auth()->id(), 403);
        abort_if($photo->person_id !== $person->id, 404);

        DB::transaction(function () use ($person, $photo) {
            $person->photos()->update(['is_primary' => false]);
            $photo->update(['is_primary' => true]);
            Person::where('id', $person->id)->update(['avatar_url' => $photo->url]);
        });

        return response()->json($photo->refresh());
    }

    /**
     * Store a remote URL as a pointer (no download). Used for LinkedIn-CDN
     * photos that we don't need to host ourselves.
     */
    private function storePointer(Person $person, Request $request): JsonResponse
    {
        $data = $request->validate([
            'url'    => 'required|url|max:1024',
            'source' => 'nullable|string|max:32',
        ]);

        $isFirst = !$person->photos()->exists();
        $photo = PersonPhoto::create([
            'id'         => (string) Str::uuid7(),
            'person_id'  => $person->id,
            'url'        => $data['url'],
            'source'     => $data['source'] ?? 'other',
            'is_primary' => $isFirst,
            'sort_order' => ($person->photos()->max('sort_order') ?? 0) + 1,
        ]);
        if ($isFirst) {
            Person::where('id', $person->id)->update(['avatar_url' => $data['url']]);
        }
        return response()->json($photo, 201);
    }

    private function extensionForMime(string $mime, ?string $fallback = null): string
    {
        return match (strtolower($mime)) {
            'image/jpeg', 'image/jpg' => 'jpg',
            'image/png'  => 'png',
            'image/gif'  => 'gif',
            'image/webp' => 'webp',
            'image/heic' => 'heic',
            'image/heif' => 'heif',
            default      => $fallback ?: 'jpg',
        };
    }
}
