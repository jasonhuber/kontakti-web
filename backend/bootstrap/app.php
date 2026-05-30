<?php

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->redirectGuestsTo(fn () => null);
    })
    ->withSchedule(function (Schedule $schedule): void {
        // TODO: when users have a timezone field, run at their local 07:00
        // instead of UTC. Throttling inside the command keeps re-runs safe.
        $schedule->command('kontakti:nightly-sync')
            ->dailyAt('07:00')
            ->withoutOverlapping()
            ->onOneServer();

        // Rebuild the precomputed contact timeline for ALL users (not just
        // Gmail-linked ones). Runs before the nightly sync so the Today inbox
        // and "who to reach out to" suggestions read a fresh schedule.
        $schedule->command('kontakti:rebuild-contact-schedule')
            ->dailyAt('06:30')
            ->withoutOverlapping()
            ->onOneServer();
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
