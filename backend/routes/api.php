<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\API\{
    AuthController,
    PeopleController,
    CompaniesController,
    ContactImportController,
    DiscussionsController,
    NotesController,
    TasksController,
    TagController,
    SearchController,
    ActivityController,
    ObsidianController,
    GraphController,
    GoogleAccountsController,
    DuplicatesController,
    TodayController,
    QuizController,
    SocialGroupsController,
    SocialProvidersController,
    SocialActivityController,
    JobsController,
    GmailController,
    VoiceController,
    PushTokensController
};

Route::prefix('v1')->group(function () {

    Route::post('auth/register', [AuthController::class, 'register']);
    Route::post('auth/login', [AuthController::class, 'login']);
    Route::post('auth/google', [AuthController::class, 'google']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::post('auth/onboarding/complete', [AuthController::class, 'completeOnboarding']);

        // Bulk contact import
        Route::post('contacts/import', [ContactImportController::class, 'import']);

        // People
        Route::post('people/enrich', [PeopleController::class, 'enrich']);
        Route::post('people/backfill-avatars', [PeopleController::class, 'backfillAvatars']);
        Route::apiResource('people', PeopleController::class);
        Route::get('people/{person}/timeline', [PeopleController::class, 'timeline']);
        Route::get('people/{person}/discussions', [PeopleController::class, 'discussions']);
        Route::get('people/{person}/deals', [PeopleController::class, 'deals']);
        Route::get('people/{person}/notes', [PeopleController::class, 'notes']);
        Route::get('people/{person}/tasks', [PeopleController::class, 'tasks']);

        // Companies
        Route::apiResource('companies', CompaniesController::class);
        Route::get('companies/{company}/people', [CompaniesController::class, 'people']);
        Route::get('companies/{company}/deals', [CompaniesController::class, 'deals']);
        Route::get('companies/{company}/discussions', [CompaniesController::class, 'discussions']);

        // Discussions
        Route::apiResource('discussions', DiscussionsController::class);
        Route::post('discussions/{discussion}/participants/{person}', [DiscussionsController::class, 'addParticipant']);
        Route::delete('discussions/{discussion}/participants/{person}', [DiscussionsController::class, 'removeParticipant']);

        // Notes (standalone + polymorphic via ?notable_type=&notable_id=)
        Route::apiResource('notes', NotesController::class);
        Route::post('notes/{note}/export', [NotesController::class, 'exportToObsidian']);

        // Tasks
        Route::apiResource('tasks', TasksController::class);
        Route::patch('tasks/{task}/complete', [TasksController::class, 'complete']);
        Route::patch('tasks/{task}/reopen', [TasksController::class, 'reopen']);

        // Tags
        Route::get('tags', [TagController::class, 'index']);
        Route::post('tags', [TagController::class, 'store']);
        Route::delete('tags/{tag}', [TagController::class, 'destroy']);

        // Search — global full-text across all entities
        Route::get('search', [SearchController::class, 'search']);
        Route::post('search/natural', [SearchController::class, 'naturalSearch']);

        // Gmail sync (per-account + all)
        Route::post('gmail/sync-all', [GmailController::class, 'syncAll']);
        Route::post('gmail/{user_google_account}/sync', [GmailController::class, 'sync']);

        // Voice capture → transcribe → entities
        Route::post('voice/capture', [VoiceController::class, 'capture']);

        // Push token registry
        Route::post('push/register', [PushTokensController::class, 'register']);
        Route::delete('push/register', [PushTokensController::class, 'unregister']);

        // Graph — nodes + edges for React Flow
        Route::get('graph', [GraphController::class, 'index']);
        Route::post('graph/links', [GraphController::class, 'createLink']);
        Route::delete('graph/links/{link}', [GraphController::class, 'deleteLink']);

        // Activity feed
        Route::get('feed', [ActivityController::class, 'feed']);

        // Obsidian sync
        Route::get('obsidian/status', [ObsidianController::class, 'status']);
        Route::post('obsidian/export', [ObsidianController::class, 'exportAll']);
        Route::post('obsidian/export/{type}/{id}', [ObsidianController::class, 'exportOne']);

        // Google accounts (multi-account linking)
        Route::get('google-accounts', [GoogleAccountsController::class, 'index']);
        Route::post('google-accounts/link', [GoogleAccountsController::class, 'link']);
        Route::patch('google-accounts/{user_google_account}', [GoogleAccountsController::class, 'update']);
        Route::delete('google-accounts/{user_google_account}', [GoogleAccountsController::class, 'destroy']);

        // Today inbox
        Route::get('today', [TodayController::class, 'index']);
        Route::post('today/items/{key}/draft', [TodayController::class, 'draft'])->where('key', '[^/]+');
        Route::post('today/items/{key}/log', [TodayController::class, 'log'])->where('key', '[^/]+');

        // Contact enrichment quiz (5-a-day)
        Route::get('quiz/today', [QuizController::class, 'today']);
        Route::get('quiz/history', [QuizController::class, 'history']);
        Route::post('quiz/{prompt}/answer', [QuizController::class, 'answer']);
        Route::post('quiz/{prompt}/skip', [QuizController::class, 'skip']);

        // Social groups
        Route::apiResource('social-groups', SocialGroupsController::class)->only(['index', 'store', 'destroy']);
        Route::post('social-groups/{social_group}/sync', [SocialGroupsController::class, 'sync']);

        // Social providers — pass-through to the enrichment proxy for the
        // "pick a group" picker UX (Facebook joined groups, WhatsApp pairing
        // status + QR, WhatsApp joined groups).
        Route::get('social-providers/facebook/groups',    [SocialProvidersController::class, 'facebookGroups']);
        Route::get('social-providers/whatsapp/status',    [SocialProvidersController::class, 'whatsappStatus']);
        Route::get('social-providers/whatsapp/qr',        [SocialProvidersController::class, 'whatsappQR']);
        Route::get('social-providers/whatsapp/groups',    [SocialProvidersController::class, 'whatsappGroups']);

        // Social activity
        Route::get('people/{person}/activity', [SocialActivityController::class, 'index']);
        Route::post('people/{person}/activity/refresh', [SocialActivityController::class, 'refresh']);
        Route::post('activity/{activity}/acknowledge', [SocialActivityController::class, 'acknowledge']);

        // Job change detection
        Route::post('jobs/detect-changes', [JobsController::class, 'detectChanges']);

        // Duplicate detection
        Route::get('duplicates', [DuplicatesController::class, 'index']);
        Route::post('duplicates/scan', [DuplicatesController::class, 'scan']);
        Route::post('duplicates/merge-identical', [DuplicatesController::class, 'mergeIdentical']);
        Route::post('duplicates/{duplicate_candidate}/merge', [DuplicatesController::class, 'merge']);
        Route::post('duplicates/{duplicate_candidate}/dismiss', [DuplicatesController::class, 'dismiss']);
    });
});
