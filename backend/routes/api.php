<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\API\{
    AuthController,
    PeopleController,
    CompaniesController,
    DiscussionsController,
    NotesController,
    TasksController,
    TagController,
    SearchController,
    ActivityController,
    ObsidianController,
    GraphController
};

Route::prefix('v1')->group(function () {

    Route::post('auth/register', [AuthController::class, 'register']);
    Route::post('auth/login', [AuthController::class, 'login']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/logout', [AuthController::class, 'logout']);

        // People
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
    });
});
