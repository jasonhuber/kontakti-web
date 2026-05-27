<?php
header('Cache-Control: no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: Thu, 01 Jan 1970 00:00:00 GMT');
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kontakti — Personal relationship intelligence.</title>
  <meta name="description" content="A personal CRM for people who want to stay on top of their relationships — not close a quota. Open source. Web, iOS, and Android.">

  <meta property="og:title" content="Kontakti — Personal relationship intelligence.">
  <meta property="og:description" content="Track people, companies, and interactions. No pipeline. No seats. Just your contacts, organized the way you think.">
  <meta property="og:url" content="https://kontakti.app">
  <meta property="og:type" content="website">

  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Kontakti — Personal relationship intelligence.">
  <meta name="twitter:description" content="A personal CRM. Open source. Web, iOS, and Android.">

  <meta name="theme-color" content="#111827">
  <link rel="icon" type="image/svg+xml" href="favicon.svg">
  <link rel="alternate icon" href="favicon.ico">
  <link rel="apple-touch-icon" href="apple-touch-icon.png">
  <link rel="stylesheet" href="style.css?v=<?php echo filemtime(__DIR__.'/style.css'); ?>">
</head>
<body>

  <nav class="nav">
    <div class="container">
      <a href="/" class="nav-logo">
        <img src="favicon.svg" alt="" width="26" height="26">
        Kontakti
      </a>
      <ul class="nav-links">
        <li><a href="#what">What</a></li>
        <li><a href="#hosting">Hosting</a></li>
        <li><a href="#repos">GitHub</a></li>
        <li><a href="/app" class="nav-cta">Sign in</a></li>
      </ul>
    </div>
  </nav>

  <!-- Hero -->
  <section class="hero">
    <div class="container">
      <h1>Personal relationship<br><em>intelligence.</em></h1>
      <p class="subhead">A CRM for one person — not a sales team chasing a quota.</p>
      <div class="hero-actions">
        <a href="/app" class="btn-primary">Get started free</a>
        <a href="https://github.com/jasonhuber/kontakti-web" target="_blank" rel="noopener" class="btn-ghost">View source on GitHub</a>
      </div>
    </div>
  </section>

  <hr class="divider">

  <!-- Statement -->
  <section id="what" class="section">
    <div class="container">
      <p class="section-label">Why Kontakti</p>
      <p class="lede">Most CRMs are built for sales teams. <em>This one isn't.</em></p>
      <p>You just want to know who you talked to, what you discussed, and who needs a follow-up. No pipeline stages. No deal tracking. No seat count. Just people, companies, and the history between you and them.</p>
    </div>
  </section>

  <hr class="divider">

  <!-- Features -->
  <section class="section">
    <div class="container">
      <h2>What's in it</h2>

      <dl class="feature-list">
        <div class="feature-item">
          <dt>People</dt>
          <dd>Full contact profiles. Relationship strength from cold to close, last contacted date, follow-up reminders, linked company, tags, and a complete interaction history.</dd>
        </div>
        <div class="feature-item">
          <dt>Companies</dt>
          <dd>Group contacts by company. See every person at a company and every discussion you've had with them, together in one view.</dd>
        </div>
        <div class="feature-item">
          <dt>Discussions</dt>
          <dd>Log calls, meetings, emails, and messages. Add a summary, full notes, and link the people who were in the room.</dd>
        </div>
        <div class="feature-item">
          <dt>Notes</dt>
          <dd>Rich text notes on any contact or company. Export to your Obsidian vault as plain Markdown with wiki-links intact.</dd>
        </div>
        <div class="feature-item">
          <dt>Activity feed</dt>
          <dd>Everything that's happened across your network in reverse chronological order. Nothing falls through the cracks.</dd>
        </div>
        <div class="feature-item">
          <dt>Contact import</dt>
          <dd>Pull contacts from your phone's address book or Gmail. Deduplicates against what you already have, so no double entries.</dd>
        </div>
      </dl>
    </div>
  </section>

  <hr class="divider">

  <!-- Open source -->
  <section class="section">
    <div class="container">
      <p class="section-label">Open source · MIT licensed</p>
      <h2>All three codebases are public.</h2>
      <p>Fork it, self-host it, or build your own client on top of the API. No vendor lock-in, no black box.</p>
      <div class="link-row">
        <a href="https://github.com/jasonhuber/kontakti-web" target="_blank" rel="noopener" class="repo-link">
          <span class="repo-arrow">→</span>
          <span class="repo-name">kontakti-web</span>
          <span class="repo-stack">Laravel 12 + React 18</span>
        </a>
        <a href="https://github.com/jasonhuber/kontakti-ios" target="_blank" rel="noopener" class="repo-link">
          <span class="repo-arrow">→</span>
          <span class="repo-name">kontakti-ios</span>
          <span class="repo-stack">SwiftUI + SwiftData</span>
        </a>
        <a href="https://github.com/jasonhuber/kontakti-android" target="_blank" rel="noopener" class="repo-link">
          <span class="repo-arrow">→</span>
          <span class="repo-name">kontakti-android</span>
          <span class="repo-stack">Kotlin + Jetpack Compose</span>
        </a>
      </div>
    </div>
  </section>

  <hr class="divider">

  <!-- Hosting -->
  <section id="hosting" class="section">
    <div class="container">
      <h2>Two ways to run it</h2>
      <dl class="feature-list">
        <div class="feature-item">
          <dt>Use ours</dt>
          <dd>Sign up at kontakti.app. No server, no setup, no credit card. <a href="/app">Get started →</a></dd>
        </div>
        <div class="feature-item">
          <dt>Self-host</dt>
          <dd>Clone the repo, set up Laravel + MySQL, deploy anywhere. <a href="https://github.com/jasonhuber/kontakti-web#self-hosting" target="_blank" rel="noopener">Self-hosting docs →</a></dd>
        </div>
      </dl>
    </div>
  </section>

  <hr class="divider">

  <!-- Mobile -->
  <section class="section">
    <div class="container">
      <p class="section-label">iOS · Android · Offline-first</p>
      <h2>Native mobile apps.</h2>
      <p>Built natively — not wrapped in React Native. Offline-first: the app serves your cached contacts immediately, then syncs when you're back online. No spinner waiting for a network connection.</p>
      <p>Import contacts directly from your phone's address book or Gmail. The same clean REST API backs the web, iOS, and Android apps — so you can build your own client on top of it too.</p>
      <div class="platform-tags">
        <span class="platform-tag">SwiftUI + SwiftData</span>
        <span class="platform-tag">Kotlin + Jetpack Compose</span>
        <span class="platform-tag">Room + WorkManager</span>
        <span class="platform-tag">NWPathMonitor</span>
      </div>
    </div>
  </section>

  <hr class="divider">

  <!-- Obsidian -->
  <section class="section">
    <div class="container">
      <p class="section-label">Obsidian integration</p>
      <h2>Works with Obsidian.</h2>
      <p>Every note you write in Kontakti can export to your Obsidian vault as plain Markdown with wiki-links intact. The structured data lives in the database; the readable version lives in your vault.</p>
      <p>Your data, in your format, in your vault — even if you stop using Kontakti tomorrow.</p>
    </div>
  </section>

  <hr class="divider">

  <!-- Closer -->
  <section class="section closer">
    <div class="container">
      <h2>Your contacts.<br>Your data.</h2>
      <p>Free to use. Open to inspect. Yours to own.</p>
      <div class="hero-actions">
        <a href="/app" class="btn-primary">Create your account</a>
        <a href="https://github.com/jasonhuber/kontakti-web" target="_blank" rel="noopener" class="btn-ghost">View source</a>
      </div>
    </div>
  </section>

  <footer class="footer">
    <div class="container">
      <div class="footer-inner">
        <span class="footer-brand">Kontakti</span>
        <nav class="footer-links">
          <a href="https://github.com/jasonhuber/kontakti-web" target="_blank" rel="noopener">GitHub</a>
          <a href="/privacy.html">Privacy</a>
          <a href="/support.html">Support</a>
        </nav>
        <span class="footer-suite">Part of the <a href="https://sustav.dev" target="_blank" rel="noopener">Sustav</a> suite</span>
      </div>
    </div>
  </footer>

</body>
</html>
