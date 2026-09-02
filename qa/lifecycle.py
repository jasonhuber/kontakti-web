#!/usr/bin/env python3
"""
lifecycle.py — write-path QA for the Kontakti API.

qa-smoke.sh proves the read surface still answers. This proves the write surface
still behaves: registration, bulk contact import (normalization + dedupe),
the person/company/discussion/note/task lifecycle, tenant isolation, and
account deletion.

It runs against a DISPOSABLE account that it registers at the start and deletes
at the end, so it is safe to point at production and leaves nothing behind. It
never authenticates as a real user for anything that writes.

Usage:
    python3 qa/lifecycle.py                       # base URL from Website/.qa-token
    python3 qa/lifecycle.py --base https://...    # explicit target
    python3 qa/lifecycle.py --keep                # skip deletion (leaves the account)

Exit code 0 = every check passed. Non-zero = the count of failures.

Cross-tenant checks need a second, real token to borrow an id from. The harness
reads QA_TOKEN out of Website/.qa-token for that and uses it READ-ONLY — it only
fetches one person id and then confirms the disposable account cannot reach it.
Without that file those two checks are skipped, not failed.

Stdlib only: no pip install, no vendor/, runs anywhere python3 does.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import string
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEBSITE = HERE.parent
FIXTURE = HERE / "fixtures" / "contacts-edge-cases.json"
QA_TOKEN_FILE = WEBSITE / ".qa-token"

USER_AGENT = "kontakti-qa-lifecycle/1.0"

TTY = sys.stdout.isatty()
GREEN = "\033[0;32m" if TTY else ""
RED = "\033[0;31m" if TTY else ""
YELLOW = "\033[0;33m" if TTY else ""
DIM = "\033[2m" if TTY else ""
CLR = "\033[0m" if TTY else ""

PASS: list[str] = []
FAIL: list[tuple[str, str]] = []
SKIP: list[tuple[str, str]] = []


def ok(label: str) -> None:
    PASS.append(label)
    print(f"{GREEN}✓{CLR} {label}")


def bad(label: str, detail: str) -> None:
    FAIL.append((label, detail))
    print(f"{RED}✗{CLR} {label}")
    print(f"  {DIM}{detail}{CLR}")


def skip(label: str, why: str) -> None:
    SKIP.append((label, why))
    print(f"{YELLOW}–{CLR} {label} {DIM}({why}){CLR}")


def section(title: str) -> None:
    print(f"\n{DIM}── {title} {'─' * max(0, 66 - len(title))}{CLR}")


def check(label: str, condition: bool, detail: str = "") -> bool:
    if condition:
        ok(label)
    else:
        bad(label, detail or "condition was false")
    return condition


# ── HTTP ──────────────────────────────────────────────────────────────────────

class Response:
    def __init__(self, status: int, body: bytes):
        self.status = status
        self.raw = body
        try:
            self.json = json.loads(body.decode("utf-8"))
        except Exception:
            self.json = None

    def snippet(self, n: int = 200) -> str:
        return self.raw.decode("utf-8", "replace")[:n].replace("\n", " ")


def request(method: str, base: str, path: str, token: str | None = None,
            payload: dict | None = None, timeout: int = 60) -> Response:
    url = base.rstrip("/") + path
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/json")
    # Cloudflare rejects the default "Python-urllib/3.x" signature with a 1010
    # before the request ever reaches Laravel. Any honest UA gets through.
    req.add_header("User-Agent", USER_AGENT)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return Response(r.status, r.read())
    except urllib.error.HTTPError as e:
        return Response(e.code, e.read())
    except urllib.error.URLError as e:
        return Response(0, str(e.reason).encode())


# ── helpers ───────────────────────────────────────────────────────────────────

def read_qa_token_file() -> dict[str, str]:
    out: dict[str, str] = {}
    if not QA_TOKEN_FILE.exists():
        return out
    for line in QA_TOKEN_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def suffix(n: int = 8) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


def all_people(base: str, token: str) -> list[dict]:
    """Page through /people so assertions see the whole imported set."""
    people: list[dict] = []
    page = 1
    while page <= 20:
        r = request("GET", base, f"/api/v1/people?per_page=100&page={page}", token)
        if r.status != 200 or not isinstance(r.json, dict):
            break
        batch = r.json.get("data") or []
        people.extend(batch)
        if page >= (r.json.get("last_page") or 1):
            break
        page += 1
    return people


def find_person(people: list[dict], *, email: str | None = None,
                first_name: str | None = None) -> dict | None:
    for p in people:
        if email is not None and (p.get("email") or "").lower() == email.lower():
            return p
        if first_name is not None and p.get("first_name") == first_name:
            return p
    return None


def date_prefix(value) -> str | None:
    """Birthdays may come back as a date or a full timestamp; compare the day."""
    if value is None:
        return None
    return str(value)[:10]


# ── the run ───────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=None, help="API base URL (default: from .qa-token)")
    ap.add_argument("--keep", action="store_true", help="do not delete the disposable account")
    args = ap.parse_args()

    env = read_qa_token_file()
    base = args.base or env.get("QA_BASE_URL") or os.environ.get("QA_BASE_URL")
    if not base:
        print("ERROR: no base URL. Pass --base or provide QA_BASE_URL in Website/.qa-token.",
              file=sys.stderr)
        return 2

    fixture = json.loads(FIXTURE.read_text())
    cases = fixture["cases"]

    tag = suffix()
    email = f"qa-lifecycle-{tag}@example.com"
    username = f"qa{tag}"
    password = "qa-" + suffix(20)

    print(f"{DIM}target      {base}{CLR}")
    print(f"{DIM}disposable  {email}{CLR}")
    print(f"{DIM}fixture     {len(cases)} contact cases{CLR}")

    # ── 1. registration ───────────────────────────────────────────────────────
    section("registration")
    r = request("POST", base, "/api/v1/auth/register", payload={
        "name": "QA Lifecycle",
        "username": username,
        "email": email,
        "password": password,
        "password_confirmation": password,
    })
    if not check("POST /auth/register creates an account", r.status == 201,
                 f"HTTP {r.status}: {r.snippet()}"):
        print("\nCannot continue without an account.", file=sys.stderr)
        return 1
    token = (r.json or {}).get("token")
    if not check("register returns a usable bearer token", bool(token),
                 f"no token in response: {r.snippet()}"):
        return 1

    user_id = ((r.json or {}).get("user") or {}).get("id")

    try:
        r = request("GET", base, "/api/v1/auth/me", token)
        check("GET /auth/me accepts the new token",
              r.status == 200 and (r.json or {}).get("email") == email,
              f"HTTP {r.status}: {r.snippet()}")

        check("a fresh account starts with zero people",
              len(all_people(base, token)) == 0,
              "new account already has people — registration is leaking state between users")

        r = request("POST", base, "/api/v1/auth/register", payload={
            "name": "QA Duplicate",
            "username": username + "x",
            "email": email,
            "password": password,
            "password_confirmation": password,
        })
        check("duplicate email is rejected (422)", r.status == 422,
              f"HTTP {r.status}: {r.snippet()}")

        # ── 2. contact import ─────────────────────────────────────────────────
        section("contact import — normalization and dedupe")
        batch_cases = [c for c in cases if not c.get("exclude_from_batch")]
        solo_cases = [c for c in cases if c.get("exclude_from_batch")]
        payload = {"contacts": [c["contact"] for c in batch_cases]}
        expected_imported = sum(1 for c in batch_cases if c["expect"]["imported"])
        expected_skipped = len(batch_cases) - expected_imported

        r = request("POST", base, "/api/v1/contacts/import", token, payload, timeout=120)
        if not check("POST /contacts/import accepts the edge-case batch",
                     r.status in (200, 201), f"HTTP {r.status}: {r.snippet(400)}"):
            raise SystemExit  # cleanup still runs via finally

        body = r.json or {}
        got_imported = body.get("imported")
        got_skipped = body.get("skipped")
        check(f"import reports {expected_imported} imported",
              got_imported == expected_imported,
              f"reported {got_imported}; response: {r.snippet(300)}")
        check(f"import reports {expected_skipped} skipped",
              got_skipped == expected_skipped,
              f"reported {got_skipped}; response: {r.snippet(300)}")

        people = all_people(base, token)
        check(f"people list holds {expected_imported} rows after import",
              len(people) == expected_imported,
              f"found {len(people)}")

        # per-case assertions
        for case in batch_cases:
            cid = case["id"]
            exp = case["expect"]
            want = exp.get("person") or {}
            if not exp["imported"]:
                continue
            contact = case["contact"]
            lookup_email = want.get("email") or (contact.get("email") if isinstance(contact, dict) else None)
            person = None
            if lookup_email:
                person = find_person(people, email=lookup_email)
            if person is None:
                fn = want.get("first_name") or (contact.get("first_name") if isinstance(contact, dict) else None)
                if fn and "first_name_length" not in want:
                    person = find_person(people, first_name=fn)
            if person is None and "first_name_length" in want:
                person = next((p for p in people
                               if (p.get("first_name") or "").startswith("Aaaa")), None)

            if person is None:
                bad(f"[{cid}] person was created", f"no matching row in the people list")
                continue

            problems = []
            for key, expected in want.items():
                if key == "first_name_length":
                    actual = len(person.get("first_name") or "")
                    if actual != expected:
                        problems.append(f"len(first_name)={actual}, want {expected}")
                    continue
                actual = person.get(key)
                if key == "birthday":
                    actual = date_prefix(actual)
                if key == "email" and isinstance(actual, str):
                    actual = actual.lower()
                if actual != expected:
                    problems.append(f"{key}={actual!r}, want {expected!r}")
            if problems:
                bad(f"[{cid}] fields match", "; ".join(problems))
            else:
                ok(f"[{cid}] {case['why'][:64]}")

        # cases that must NOT have produced a row
        for case in batch_cases:
            if case["expect"]["imported"]:
                continue
            contact = case["contact"]
            if not isinstance(contact, dict):
                continue
            ln = contact.get("last_name")
            if ln:
                dupe = next((p for p in people if p.get("last_name") == ln), None)
                check(f"[{case['id']}] no row created", dupe is None,
                      f"a person with last_name={ln!r} exists but should have been skipped")

        # ── 2b. rows sent on their own ────────────────────────────────────────
        for case in solo_cases:
            want = case.get("expect_status", 200)
            r = request("POST", base, "/api/v1/contacts/import", token,
                        {"contacts": [case["contact"]]})
            check(f"[{case['id']}] import returns {want} for a lone malformed row",
                  r.status == want,
                  f"HTTP {r.status} (expected {want}): {r.snippet(300)}")
            if want == 422:
                print(f"  {YELLOW}note{CLR} {DIM}a single bad row rejects the whole batch; "
                      f"normalizeContact's is_array guard is unreachable{CLR}")

        # ── 3. import idempotency ─────────────────────────────────────────────
        section("import idempotency")
        r = request("POST", base, "/api/v1/contacts/import", token, payload, timeout=120)
        body = r.json or {}
        dupes = [p.get("first_name") for p in (body.get("people") or [])]
        check("re-importing the same batch imports nothing new",
              r.status in (200, 201) and body.get("imported") == 0,
              f"HTTP {r.status}, imported={body.get('imported')} "
              f"{dupes} — rows with neither an email nor a phone have nothing to "
              f"dedupe against, so every re-import duplicates them")
        check("people count is unchanged after the re-import",
              len(all_people(base, token)) == expected_imported,
              "the second import created rows")

        # ── 4. write lifecycle ────────────────────────────────────────────────
        section("write lifecycle")
        r = request("POST", base, "/api/v1/companies", token, {"name": f"QA Corp {tag}"})
        company_id = ((r.json or {}).get("data") or r.json or {}).get("id")
        check("POST /companies creates a company", r.status in (200, 201) and bool(company_id),
              f"HTTP {r.status}: {r.snippet()}")

        r = request("POST", base, "/api/v1/people", token, {
            "first_name": "Manual", "last_name": "Entry",
            "email": f"manual-{tag}@example.com",
            "company_id": company_id,
        })
        person_id = ((r.json or {}).get("data") or r.json or {}).get("id")
        check("POST /people creates a person", r.status in (200, 201) and bool(person_id),
              f"HTTP {r.status}: {r.snippet()}")

        if person_id:
            r = request("PUT", base, f"/api/v1/people/{person_id}", token,
                        {"title": "Head of QA"})
            check("PUT /people/{id} updates it", r.status in (200, 201),
                  f"HTTP {r.status}: {r.snippet()}")

            r = request("GET", base, f"/api/v1/people/{person_id}", token)
            got = ((r.json or {}).get("data") or r.json or {}).get("title")
            check("the update is readable back", got == "Head of QA",
                  f"title={got!r}")

            r = request("POST", base, "/api/v1/discussions", token, {
                "title": "QA lifecycle discussion",
                "date": "2026-09-01 10:00:00",
                "type": "call",
                "summary": "Logged by qa/lifecycle.py",
                "participant_ids": [person_id],
            })
            check("POST /discussions logs a conversation", r.status in (200, 201),
                  f"HTTP {r.status}: {r.snippet()}")

            r = request("GET", base, f"/api/v1/people/{person_id}", token)
            lca = ((r.json or {}).get("data") or r.json or {}).get("last_contacted_at")
            check("the discussion pushed last_contacted_at onto the participant",
                  bool(lca) and str(lca).startswith("2026-09-01"),
                  f"last_contacted_at={lca!r} — participant attach or the "
                  f"last_contacted_at update did not fire")

            r = request("POST", base, "/api/v1/notes", token, {
                "noteable_type": "person", "noteable_id": person_id,
                "body": "QA lifecycle note",
            })
            check("POST /notes attaches a note", r.status in (200, 201),
                  f"HTTP {r.status}: {r.snippet()}")

            r = request("POST", base, "/api/v1/tasks", token, {
                "title": "QA lifecycle follow-up",
                "taskable_type": "person", "taskable_id": person_id,
                "due_at": "2026-09-30",
            })
            task_id = ((r.json or {}).get("data") or r.json or {}).get("id")
            check("POST /tasks creates a follow-up", r.status in (200, 201) and bool(task_id),
                  f"HTTP {r.status}: {r.snippet()}")

            if task_id:
                r = request("PATCH", base, f"/api/v1/tasks/{task_id}/complete", token, {})
                check("PATCH /tasks/{id}/complete closes it", r.status in (200, 201, 204),
                      f"HTTP {r.status}: {r.snippet()}")

            r = request("POST", base, f"/api/v1/people/{person_id}/log-contact", token,
                        {"via": "email", "note": "logged by qa/lifecycle.py"})
            check("POST /people/{id}/log-contact records an interaction",
                  r.status in (200, 201, 204), f"HTTP {r.status}: {r.snippet()}")

        r = request("POST", base, "/api/v1/duplicates/scan", token, {})
        check("POST /duplicates/scan runs over the imported set",
              r.status in (200, 201, 202), f"HTTP {r.status}: {r.snippet()}")

        r = request("GET", base, "/api/v1/people/health", token)
        check("GET /people/health summarizes the new account", r.status == 200,
              f"HTTP {r.status}: {r.snippet()}")

        # ── 5. tenant isolation ───────────────────────────────────────────────
        section("tenant isolation")
        other_token = env.get("QA_TOKEN")
        if not other_token:
            skip("cross-tenant person read is blocked", "no QA_TOKEN in .qa-token")
            skip("cross-tenant person write is blocked", "no QA_TOKEN in .qa-token")
        else:
            r = request("GET", base, "/api/v1/people?per_page=1", other_token)
            rows = (r.json or {}).get("data") or []
            other_id = rows[0].get("id") if rows else None
            if not other_id:
                skip("cross-tenant person read is blocked", "could not borrow a foreign id")
                skip("cross-tenant person write is blocked", "could not borrow a foreign id")
            else:
                r = request("GET", base, f"/api/v1/people/{other_id}", token)
                check("reading another user's person is refused",
                      r.status in (403, 404),
                      f"HTTP {r.status} — expected 403/404, got a readable body: {r.snippet()}")
                r = request("PUT", base, f"/api/v1/people/{other_id}", token,
                            {"title": "should never be written"})
                check("writing to another user's person is refused",
                      r.status in (403, 404, 422),
                      f"HTTP {r.status} — a foreign row may have been modified: {r.snippet()}")

        r = request("GET", base, "/api/v1/people", None)
        check("unauthenticated access is refused (401)", r.status == 401,
              f"HTTP {r.status}: {r.snippet()}")

    finally:
        # ── 6. deletion ───────────────────────────────────────────────────────
        section("account deletion")
        if args.keep:
            skip("account is deleted", f"--keep passed; {email} left in place")
        else:
            r = request("DELETE", base, "/api/v1/auth/account", token,
                        {"confirmation": "DELETE"})
            deleted = check("DELETE /auth/account removes the account",
                            r.status in (200, 204), f"HTTP {r.status}: {r.snippet()}")
            if deleted:
                r = request("GET", base, "/api/v1/auth/me", token)
                check("the token is dead after deletion", r.status == 401,
                      f"HTTP {r.status} — token still works after account deletion")
                r = request("POST", base, "/api/v1/auth/login",
                            payload={"email": email, "password": password})
                check("the deleted account cannot log back in",
                      r.status in (401, 422), f"HTTP {r.status}: {r.snippet()}")
            else:
                print(f"\n{RED}Cleanup failed — {email} (user {user_id}) is still on "
                      f"{base} and must be removed by hand.{CLR}", file=sys.stderr)

    # ── summary ───────────────────────────────────────────────────────────────
    print()
    line = f"{len(PASS)} passed"
    if FAIL:
        line += f", {RED}{len(FAIL)} failed{CLR}"
    if SKIP:
        line += f", {len(SKIP)} skipped"
    print(line)
    if FAIL:
        print("\nFailures:")
        for label, detail in FAIL:
            print(f"  {RED}✗{CLR} {label}\n    {DIM}{detail}{CLR}")
    return min(len(FAIL), 250)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit as e:
        if isinstance(e.code, int):
            raise
        sys.exit(1)
