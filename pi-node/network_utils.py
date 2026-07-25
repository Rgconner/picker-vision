"""Network utility helpers for the Picker Vision Pi node."""

import socket
import urllib.parse


def resolve_stream_host(server_url: str, override: str = "") -> str:
    """Return the LAN IP this node should advertise to the server.

    Resolution order
    ----------------
    1. *override* — if non-empty, use it verbatim (operator-set STREAM_HOST).
    2. UDP-socket probe — open a UDP socket toward the server host; the OS
       picks the correct outbound interface without sending any data.  This
       works even on DHCP networks and multi-homed hosts.
    3. Fallback to "127.0.0.1" so the caller always gets a usable string.
    """
    if override:
        return override

    try:
        parsed = urllib.parse.urlparse(server_url)
        host = parsed.hostname or "8.8.8.8"
        port = parsed.port or 80
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect((host, port))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
