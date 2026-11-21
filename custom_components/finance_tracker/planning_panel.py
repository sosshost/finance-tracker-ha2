"""Read-only finance-planning endpoint used by the unified Finance Tracker panel."""

from __future__ import annotations

from pathlib import Path

from aiohttp import web
from homeassistant.components import websocket_api
from homeassistant.components.http import HomeAssistantView
import voluptuous as vol

from .finance_planning import read_planning

PLANNING_ASSET_URL = "/api/finance_tracker/ui/planning.js"


class PlanningAssetView(HomeAssistantView):
    """Serve the planning web component."""

    url = PLANNING_ASSET_URL
    name = "api:finance_tracker:ui:planning"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        source = Path(__file__).resolve().parent / "panel" / "planning_ui.js"
        data = await request.app["hass"].async_add_executor_job(source.read_bytes)
        return web.Response(
            body=data,
            content_type="text/javascript",
            headers={"Cache-Control": "no-store, max-age=0"},
        )


def register_planning_endpoint(hass) -> None:
    """Register planning data and its JavaScript asset without a second sidebar panel."""

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "finance_tracker/planning_v3",
            vol.Optional("month"): str,
        }
    )
    @websocket_api.async_response
    async def handle_planning(hass, connection, msg):
        try:
            database = hass.config.path("finance/household_v2.db")
            result = await hass.async_add_executor_job(
                read_planning, database, msg.get("month")
            )
            connection.send_result(msg["id"], result)
        except Exception as exc:
            connection.send_error(msg["id"], "planning_read_error", str(exc)[:300])

    websocket_api.async_register_command(hass, handle_planning)
    hass.http.register_view(PlanningAssetView())
