"""ZAP packaged-scan hook: inject `Authorization: Bearer <token>` on every request.

Passing a replacer rule via `-z` doesn't work for bearer auth — the `-z` string
is space-delimited, so the space in "Bearer <token>" (and the required per-option
`-config` prefixes) get mangled and the header silently never applies. Setting the
rule through the ZAP API here avoids all shell-quoting: the token is read from the
ZAP_BEARER env var and the replacement string keeps its space intact.

zap-api-scan.py calls zap_started(zap, target) after the daemon is up. REQ_HEADER
adds the header when absent, so it authenticates every scanned request.
"""
import os


def zap_started(zap, target):
    token = os.environ.get("ZAP_BEARER", "").strip()
    if not token:
        print("[auth-hook] ZAP_BEARER not set — running UNAUTHENTICATED")
        return
    # zapv2's Replacer.add_rule takes stringy booleans; keyword args guard
    # against positional-order drift between ZAP versions.
    zap.replacer.add_rule(
        description="authbearer",
        enabled="true",
        matchtype="REQ_HEADER",
        matchregex="false",
        matchstring="Authorization",
        replacement=f"Bearer {token}",
    )
    print("[auth-hook] Authorization: Bearer <token> will be added to every request")
