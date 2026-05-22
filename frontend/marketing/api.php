<?php
/**
 * Thin API bootstrap — routes /api/* requests to the Laravel backend.
 * Lives in public_html/ so the rewrite target is a real web-accessible file.
 * REQUEST_URI is untouched, so Laravel receives the full /api/v1/... path.
 */
require __DIR__ . '/../backend/public/index.php';
