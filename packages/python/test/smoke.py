import json
from unittest.mock import patch
from agent_mandate import AgentMandate

calls = []
class Response:
    def __enter__(self): return self
    def __exit__(self, *_args): return False
    def read(self): return json.dumps({"ok": True, "product": "fixture", "version": "1.0.0"}).encode()

def fake_urlopen(request, *args, **kwargs):
    calls.append(request.full_url)
    assert request.full_url == "https://mock.invalid/health"
    return Response()

with patch("urllib.request.urlopen", side_effect=fake_urlopen):
    client = AgentMandate("nonsecret-sentinel", base_url="https://mock.invalid")
    assert calls == []
    result = client.health()
    assert result["ok"] is True
    assert calls == ["https://mock.invalid/health"]
print("pypi smoke: PASS")
