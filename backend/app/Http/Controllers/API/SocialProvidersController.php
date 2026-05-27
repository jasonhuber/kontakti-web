<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\{Http, Log};

/**
 * Pass-through endpoints to the enrichment proxy for the "pick a group" UX.
 *
 * Each method authenticates via sanctum (group-level middleware), then forwards
 * to the proxy with the shared API key. The proxy itself decides whether the
 * underlying browser session is logged in / paired and returns 503 with a
 * { error, remediation } payload when it isn't — we forward that body intact
 * so the picker UI can show actionable guidance instead of a generic error.
 */
class SocialProvidersController extends Controller
{
    public function facebookGroups(Request $request): JsonResponse
    {
        return $this->proxyGet('/enrich/facebook/my-groups');
    }

    public function whatsappStatus(Request $request): JsonResponse
    {
        return $this->proxyGet('/enrich/whatsapp/status');
    }

    public function whatsappQR(Request $request): JsonResponse
    {
        return $this->proxyGet('/enrich/whatsapp/qr');
    }

    public function whatsappGroups(Request $request): JsonResponse
    {
        return $this->proxyGet('/enrich/whatsapp/my-groups');
    }

    /**
     * Forward a GET to the proxy. 200/503 bodies pass through unchanged so the
     * UI can surface remediation hints; anything else collapses to a generic
     * 502 upstream_unavailable.
     */
    private function proxyGet(string $endpoint): JsonResponse
    {
        $base = rtrim((string) config('services.scraper.url', ''), '/');
        if ($base === '') {
            return response()->json([
                'error'       => 'upstream_unavailable',
                'remediation' => 'Enrichment proxy URL not configured (services.scraper.url).',
            ], 502);
        }

        $headers = [];
        if ($key = config('services.scraper.key')) {
            $headers['x-api-key'] = $key;
        }

        try {
            $response = Http::withHeaders($headers)
                ->timeout(60)
                ->get($base . $endpoint);
        } catch (\Throwable $e) {
            Log::warning('SocialProviders proxy call failed', [
                'endpoint' => $endpoint,
                'err'      => $e->getMessage(),
            ]);
            return response()->json(['error' => 'upstream_unavailable'], 502);
        }

        $status = $response->status();

        if ($status === 200) {
            return response()->json($response->json(), 200);
        }

        // Forward 503 bodies so the UI sees { error, remediation } intact.
        if ($status === 503) {
            $body = $response->json() ?: ['error' => 'session_expired'];
            return response()->json($body, 503);
        }

        Log::warning('SocialProviders proxy non-2xx', [
            'endpoint' => $endpoint,
            'status'   => $status,
            'body'     => $response->body(),
        ]);
        return response()->json(['error' => 'upstream_unavailable'], 502);
    }
}
