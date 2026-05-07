"""Tests for credential store module. Run with: python3 -m pytest scripts/tests/test_credentials.py -v"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.credentials import (
    _service_name,
    _username_service_name,
    SUPPORTED_SITES,
    set_credential,
    set_username,
    get_password,
    get_username,
    delete_credential,
    delete_username,
    list_sites,
)


def test_service_name_valid():
    assert _service_name("xiaohongshu") == "aios-browser-mcp/xiaohongshu"
    assert _service_name("jimeng") == "aios-browser-mcp/jimeng"


def test_service_name_invalid():
    try:
        _service_name("unsupported")
        assert False, "should have raised ValueError"
    except ValueError as e:
        assert "Unsupported site" in str(e)


def test_username_service_name():
    assert _username_service_name("xiaohongshu") == "aios-browser-mcp/xiaohongshu/username"


def test_supported_sites():
    assert "xiaohongshu" in SUPPORTED_SITES
    assert "jimeng" in SUPPORTED_SITES
    assert len(SUPPORTED_SITES) == 2


def test_set_get_delete_round_trip():
    site = "xiaohongshu"
    account_label = "test-roundtrip"
    test_pw = "test-password-roundtrip-2026"

    # Clean up
    delete_credential(site, account_label)

    # Set
    set_credential(site, account_label, test_pw)

    # Get
    result = get_password(site, account_label)
    assert result == test_pw

    # Delete
    assert delete_credential(site, account_label) is True

    # Verify deleted
    try:
        get_password(site, account_label)
        assert False, "should have raised KeyError after delete"
    except KeyError:
        pass

    # Delete again returns False
    assert delete_credential(site, account_label) is False


def test_username_round_trip():
    site = "xiaohongshu"
    account_label = "test-username"

    delete_username(site, account_label)

    set_username(site, account_label, "myuser@test.com")
    result = get_username(site, account_label)
    assert result == "myuser@test.com"

    delete_username(site, account_label)
    assert get_username(site, account_label) is None


def test_get_password_nonexistent():
    try:
        get_password("xiaohongshu", "nonexistent-account-zzz")
        assert False, "should have raised KeyError"
    except KeyError:
        pass


def test_list_sites_keys():
    entries = list_sites()
    assert isinstance(entries, list)
    for entry in entries:
        assert "site" in entry
        assert "account" in entry
        assert "has_password" in entry
