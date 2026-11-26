"""Home Assistant entry point for the Finance Tracker household ledger."""

from __future__ import annotations

import logging
import sqlite3
from collections.abc import Callable
from typing import Any

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
import voluptuous as vol

from .account_meta import action as account_meta_action
from .booking_proposals import decide as decide_proposal
from .booking_proposals import list_proposals
from .category_admin import action as category_admin_action
from .category_catalog import initialize as initialize_categories
from .category_catalog import summary as category_summary
from .const import DOMAIN, LEDGER_KEY, RUNTIME_READY_KEY
from .frontend import async_register_frontend, async_unregister_frontend
from .direct_debit import action as debit_action, run as run_debits
from homeassistant.helpers.event import async_track_time_change
from .ledger import Ledger
from .month_validation import validate_month_report
from .plan_actual import action as plan_actual_action
from .plan_templates import action as template_action
from .planning_edit import action as plan_action
from .planning_panel import register_planning_endpoint

_LOGGER = logging.getLogger(__name__)
CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)

_VALIDATION_ERRORS = (
    HomeAssistantError,
    ValueError,
    TypeError,
    OverflowError,
    sqlite3.IntegrityError,
)


def _report_failure(connection, msg: dict[str, Any], label: str, public_message: str) -> None:
    """Log an unexpected request failure and return a stable websocket error."""
    _LOGGER.exception("Finance Tracker request failed: %s", label)
    connection.send_error(msg["id"], "internal_error", public_message)


async def _run_worker(
    hass: HomeAssistant,
    connection,
    msg: dict[str, Any],
    label: str,
    public_message: str,
    func: Callable[..., Any],
    *args: Any,
) -> None:
    """Run synchronous finance work outside Home Assistant's event loop."""
    try:
        result = await hass.async_add_executor_job(func, *args)
    except _VALIDATION_ERRORS as exc:
        connection.send_error(msg["id"], "validation_error", str(exc))
    except Exception:
        _report_failure(connection, msg, label, public_message)
    else:
        connection.send_result(msg["id"], result)


def _request_actor(connection):
    return {'id': connection.user.id, 'name': connection.user.name}


def _register_direct_debit(hass: HomeAssistant) -> None:
    @websocket_api.websocket_command({
        vol.Required("type"): "finance_tracker/direct_debit",
        vol.Required("op"): vol.In(["info", "global", "run"]),
        vol.Optional("data", default={}): dict,
    })
    @websocket_api.async_response
    async def command(hass, connection, msg):
        if msg["op"] != "info" and not connection.user.is_admin:
            connection.send_error(msg["id"], "unauthorized", "Nur Administratoren dürfen die Automatik steuern")
            return
        await _run_worker(hass, connection, msg, "direct_debit", "Lastschriftaktion fehlgeschlagen",
                          debit_action, hass, msg["op"], msg["data"])
    websocket_api.async_register_command(hass, command)


def _register_category_summary(hass: HomeAssistant) -> None:
    @websocket_api.websocket_command(
        {
            vol.Required("type"): "finance_tracker/category_summary",
            vol.Optional("month"): str,
        }
    )
    @websocket_api.async_response
    async def category_summary_command(hass, connection, msg):
        await _run_worker(
            hass,
            connection,
            msg,
            "category_summary",
            "Kategorienauswertung fehlgeschlagen",
            category_summary,
            hass,
            msg.get("month"),
        )

    websocket_api.async_register_command(hass, category_summary_command)


def _register_category_admin(hass: HomeAssistant) -> None:
    @websocket_api.websocket_command(
        {
            vol.Required("type"): "finance_tracker/category_admin",
            vol.Required("op"): vol.In(
                ["list", "add_group", "rename_group", "add_sub", "save_sub", "inspect_remove", "remove", "restore"]
            ),
            vol.Optional("data", default={}): dict,
        }
    )
    @websocket_api.async_response
    async def category_admin_command(hass, connection, msg):
        await _run_worker(
            hass,
            connection,
            msg,
            "category_admin",
            "Kategorieverwaltung fehlgeschlagen",
            category_admin_action,
            hass,
            msg["op"],
            msg["data"],
        )

    websocket_api.async_register_command(hass, category_admin_command)


def _register_account_meta(hass: HomeAssistant) -> None:
    @websocket_api.websocket_command(
        {
            vol.Required("type"): "finance_tracker/account_meta",
            vol.Required("op"): vol.In(["list", "save", "owner_add", "owner_save", "owner_delete"]),
            vol.Optional("data", default={}): dict,
        }
    )
    @websocket_api.async_response
    async def account_meta_command(hass, connection, msg):
        await _run_worker(
            hass,
            connection,
            msg,
            "account_meta",
            "Kontenstammdaten konnten nicht gespeichert werden",
            account_meta_action,
            hass,
            msg["op"],
            msg["data"],
        )

    websocket_api.async_register_command(hass, account_meta_command)


def _register_proposals(hass: HomeAssistant) -> None:
    @websocket_api.websocket_command(
        {
            vol.Required("type"): "finance_tracker/proposals",
            vol.Required("op"): vol.In(["list", "decide"]),
            vol.Optional("data", default={}): dict,
        }
    )
    @websocket_api.async_response
    async def proposal_command(hass, connection, msg):
        data = msg["data"]
        if msg["op"] == "list":
            await _run_worker(
                hass,
                connection,
                msg,
                "proposal_list",
                "Buchungsvorschläge konnten nicht geladen werden",
                list_proposals,
                hass,
                data.get("month"),
            )
            return
        await _run_worker(
            hass,
            connection,
            msg,
            "proposal_decision",
            "Buchungsvorschlag konnte nicht verarbeitet werden",
            decide_proposal,
            hass,
            data,
            _request_actor(connection),
        )

    websocket_api.async_register_command(hass, proposal_command)


def _register_plan_editor(hass: HomeAssistant) -> None:
    @websocket_api.websocket_command(
        {
            vol.Required("type"): "finance_tracker/plan_edit",
            vol.Required("op"): vol.In(
                [
                    "info",
                    "create",
                    "save",
                    "add_position",
                    "exclude",
                    "release",
                    "revise",
                    "delete",
                ]
            ),
            vol.Optional("data", default={}): dict,
        }
    )
    @websocket_api.async_response
    async def plan_editor_command(hass, connection, msg):
        if msg["op"] == "save" and "debit_enabled" in msg["data"] and not connection.user.is_admin:
            connection.send_error(msg["id"], "unauthorized", "Lastschriftmerkmale dürfen nur Administratoren ändern")
            return
        await _run_worker(
            hass,
            connection,
            msg,
            "plan_edit",
            "Planänderung fehlgeschlagen",
            plan_action,
            hass,
            msg["op"],
            msg["data"],
        )

    websocket_api.async_register_command(hass, plan_editor_command)


def _register_templates(hass: HomeAssistant) -> None:
    @websocket_api.websocket_command(
        {
            vol.Required("type"): "finance_tracker/templates",
            vol.Required("op"): vol.In(
                ["list", "save", "apply", "propagate", "delete", "source", "import_from_plan"]
            ),
            vol.Optional("data", default={}): dict,
        }
    )
    @websocket_api.async_response
    async def template_command(hass, connection, msg):
        if (msg["op"] == "propagate" or (msg["op"] == "save" and "debit_enabled" in msg["data"])) and not connection.user.is_admin:
            connection.send_error(msg["id"], "unauthorized", "Lastschriftmerkmale dürfen nur Administratoren ändern")
            return
        await _run_worker(
            hass,
            connection,
            msg,
            "templates",
            "Vorlagenaktion fehlgeschlagen",
            template_action,
            hass,
            msg["op"],
            msg["data"],
        )

    websocket_api.async_register_command(hass, template_command)


def _register_plan_actual(hass: HomeAssistant) -> None:
    @websocket_api.websocket_command(
        {
            vol.Required("type"): "finance_tracker/plan_actual",
            vol.Required("op"): vol.In(["list", "assign", "remove", "remove_transaction"]),
            vol.Optional("data", default={}): dict,
        }
    )
    @websocket_api.async_response
    async def plan_actual_command(hass, connection, msg):
        await _run_worker(
            hass,
            connection,
            msg,
            "plan_actual",
            "Plan-Ist-Zuordnung fehlgeschlagen",
            plan_actual_action,
            hass,
            msg["op"],
            msg["data"],
            _request_actor(connection),
        )

    websocket_api.async_register_command(hass, plan_actual_command)


def _register_month_validation(hass: HomeAssistant) -> None:
    @websocket_api.websocket_command(
        {
            vol.Required("type"): "finance_tracker/month_validation",
            vol.Required("month"): str,
        }
    )
    @websocket_api.async_response
    async def month_validation_command(hass, connection, msg):
        await _run_worker(
            hass,
            connection,
            msg,
            "month_validation",
            "Monatsprüfung fehlgeschlagen",
            validate_month_report,
            hass,
            msg["month"],
        )

    websocket_api.async_register_command(hass, month_validation_command)


def _register_ledger(hass: HomeAssistant) -> None:
    operations = [
        "overview",
        "add_account",
        "update_account",
        "delete_account",
        "archive_account",
        "reactivate_account",
        "add_category",
        "add_transaction",
        "transfer",
        "close_month",
        "save_closing_draft",
        "confirm_closing",
        "closing_history",
        "edit_transaction",
        "edit_transfer",
        "void_transaction",
        "transaction_detail",
        "audit_log",
        "month_summary",
        "add_recurring",
        "set_recurring_active",
        "post_recurring",
        "set_budget",
        "budget_summary",
        "year_summary",
    ]

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "finance_tracker/v2",
            vol.Required("op"): vol.In(operations),
            vol.Optional("data", default={}): dict,
        }
    )
    @websocket_api.async_response
    async def ledger_command(hass, connection, msg):
        ledger = Ledger(hass, _request_actor(connection))
        names = {}
        if msg["op"] in ("overview", "audit_log"):
            names = {user.id: user.name for user in await hass.auth.async_get_users()}
        await _run_worker(
            hass,
            connection,
            msg,
            "ledger",
            "Interner Fehler; siehe HA-Protokoll",
            ledger.execute,
            msg["op"],
            {**msg["data"], "_actor": connection.user.id, "_actor_names": names},
        )

    websocket_api.async_register_command(hass, ledger_command)


def _register_runtime_interfaces(hass: HomeAssistant) -> None:
    """Install every websocket endpoint exactly once for this HA process."""
    _register_category_summary(hass)
    _register_direct_debit(hass)
    _register_category_admin(hass)
    _register_account_meta(hass)
    _register_proposals(hass)
    _register_plan_editor(hass)
    _register_templates(hass)
    _register_plan_actual(hass)
    _register_month_validation(hass)
    _register_ledger(hass)
    register_planning_endpoint(hass)


async def _ensure_runtime(hass: HomeAssistant) -> None:
    """Initialize the ledger, supporting catalogs, APIs, and frontend."""
    runtime = hass.data.setdefault(DOMAIN, {})

    if not runtime.get(RUNTIME_READY_KEY):
        ledger = Ledger(hass)
        runtime[LEDGER_KEY] = ledger
        await hass.async_add_executor_job(ledger.execute, "overview", {})
        await hass.async_add_executor_job(initialize_categories, hass)
        _register_runtime_interfaces(hass)
        runtime[RUNTIME_READY_KEY] = True

    if not runtime.get("debit_scheduler"):
        async def check_debits(_now):
            try:
                await hass.async_add_executor_job(run_debits, hass)
            except Exception:
                _LOGGER.exception("Finance Tracker automatische Lastschriftprüfung fehlgeschlagen")
        runtime["debit_scheduler"] = async_track_time_change(hass, check_debits, hour=7, minute=5, second=0)
        hass.async_create_task(check_debits(None))

    await async_register_frontend(hass)


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    """Support startup while the config entry is present."""
    await _ensure_runtime(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up the single local Finance Tracker config entry."""
    await _ensure_runtime(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Detach the visible panel; runtime data is rebuilt on the next HA restart."""
    async_unregister_frontend(hass)
    return True


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Remove UI registration without deleting the household finance database."""
    async_unregister_frontend(hass)
