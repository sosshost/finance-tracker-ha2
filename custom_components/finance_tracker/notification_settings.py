"""Global notification preferences, independent of recipient routing."""
import json
import logging
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import RLock
from homeassistant.exceptions import HomeAssistantError

DEFAULTS = {'posted': True, 'blocked': True}
_LOCK = RLock()
_LOGGER = logging.getLogger(__name__)


def _path(hass):
    return Path(hass.config.path('finance/notification_settings.json'))


def read(hass):
    with _LOCK:
        try:
            data = json.loads(_path(hass).read_text(encoding='utf-8'))
        except FileNotFoundError:
            return DEFAULTS.copy()
        if not isinstance(data, dict) or any(type(data.get(k)) is not bool for k in DEFAULTS):
            raise HomeAssistantError('Ungültige Benachrichtigungseinstellungen')
        return {k: data[k] for k in DEFAULTS}


def enabled(hass, status):
    try:
        return read(hass).get(status, False)
    except Exception:
        _LOGGER.exception('Benachrichtigungseinstellungen nicht lesbar; Versand unterdrückt')
        return False


def action(hass, op, data):
    if op == 'info':
        return read(hass)
    if op != 'save' or set(data) != {'event', 'enabled'} or data['event'] not in DEFAULTS or type(data['enabled']) is not bool:
        raise HomeAssistantError('Ungültige Benachrichtigungseinstellung')
    with _LOCK:
        settings = read(hass)
        settings[data['event']] = data['enabled']
        path = _path(hass)
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = None
        try:
            with NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as f:
                temp = Path(f.name)
                json.dump(settings, f)
            temp.replace(path)
        finally:
            if temp is not None:
                temp.unlink(missing_ok=True)
        return settings
