"""Configuration flow for the local Finance Tracker workspace."""

from __future__ import annotations

from typing import Any

from homeassistant import config_entries

from .const import DOMAIN


class FinanceTrackerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Create the single Finance Tracker workspace for this Home Assistant."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Offer one local instance without accounts, tokens, or cloud credentials."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is None:
            return self.async_show_form(step_id="user", data_schema=None)

        return self.async_create_entry(title="Finance Tracker", data={})
