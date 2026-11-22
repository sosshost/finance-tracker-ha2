"""Serve the Finance Tracker web modules and register the sidebar panel."""

from __future__ import annotations

import hashlib
from pathlib import Path

from aiohttp import web
from homeassistant.components.frontend import async_register_built_in_panel, async_remove_panel
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import (
    DOMAIN,
    MAIN_PANEL_ELEMENT,
    REGISTERED_ASSETS_KEY,
    SIDEBAR_ICON,
    SIDEBAR_PATH,
    SIDEBAR_TITLE,
)

_UI_ROOT = "/api/finance_tracker/ui"
_ASSET_FILES: tuple[tuple[str, str], ...] = (
    ("main.js", "unified.js"),
    ("ledger.js", "entrypoint.js"),
    ("planning.js", "planning_ui.js"),
    ("templates.js", "templates_ui.js"),
    ("closing.js", "closing_ui.js"),
)


class FinanceTrackerAssetView(HomeAssistantView):
    """Return one JavaScript module from the integration's panel directory."""

    requires_auth = False

    def __init__(self, route: str, source: Path) -> None:
        self.url = route
        self.name = f"api:finance_tracker:ui:{source.stem}"
        self._source = source

    async def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        if not await hass.async_add_executor_job(self._source.is_file):
            return web.Response(status=404, text="Not Found")

        payload = await hass.async_add_executor_job(self._source.read_bytes)
        return web.Response(
            body=payload,
            content_type="text/javascript",
            headers={"Cache-Control": "no-store, max-age=0"},
        )


async def _frontend_revision(hass: HomeAssistant, panel_dir: Path) -> str:
    """Build a short content revision from every module used by the unified panel."""

    def calculate() -> str:
        digest = hashlib.sha256()
        for _route_name, file_name in _ASSET_FILES:
            digest.update((panel_dir / file_name).read_bytes())
        digest.update((panel_dir / "planning_ui.js").read_bytes())
        return digest.hexdigest()[:12]

    return await hass.async_add_executor_job(calculate)


async def async_register_frontend(hass: HomeAssistant) -> None:
    """Register module endpoints once and refresh the Finance sidebar panel."""
    integration_dir = Path(__file__).resolve().parent
    panel_dir = integration_dir / "panel"
    runtime = hass.data.setdefault(DOMAIN, {})
    registered = runtime.setdefault(REGISTERED_ASSETS_KEY, set())
    if not isinstance(registered, set):
        registered = set()
        runtime[REGISTERED_ASSETS_KEY] = registered

    for route_name, file_name in _ASSET_FILES:
        route = f"{_UI_ROOT}/{route_name}"
        if route in registered:
            continue
        hass.http.register_view(FinanceTrackerAssetView(route, panel_dir / file_name))
        registered.add(route)

    revision = await _frontend_revision(hass, panel_dir)
    async_remove_panel(hass, SIDEBAR_PATH, warn_if_unknown=False)
    async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title=SIDEBAR_TITLE,
        sidebar_icon=SIDEBAR_ICON,
        frontend_url_path=SIDEBAR_PATH,
        config={
            "_panel_custom": {
                "name": MAIN_PANEL_ELEMENT,
                "embed_iframe": False,
                "trust_external": False,
                "js_url": f"{_UI_ROOT}/main.js?v={revision}",
            }
        },
        require_admin=False,
    )


def async_unregister_frontend(hass: HomeAssistant) -> None:
    """Remove only the sidebar registration; stored finance data remains untouched."""
    async_remove_panel(hass, SIDEBAR_PATH, warn_if_unknown=False)
