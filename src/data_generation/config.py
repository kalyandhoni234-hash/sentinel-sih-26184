"""Configuration loader for the synthetic data generator."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


_DEFAULT_CONFIG_PATH = Path(__file__).parent.parent.parent / "configs" / "default.yaml"


def load_config(path: Path | str | None = None) -> dict[str, Any]:
    """Load configuration from a YAML file.

    Args:
        path: Path to the YAML config file. Defaults to configs/default.yaml.

    Returns:
        Parsed configuration dictionary.
    """
    config_path = Path(path) if path else _DEFAULT_CONFIG_PATH
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def get_generation_params(config: dict[str, Any]) -> dict[str, Any]:
    """Extract generation parameters from config."""
    return config.get("generation", {})


def get_geography_params(config: dict[str, Any]) -> dict[str, Any]:
    """Extract geography parameters from config."""
    return config.get("geography", {})


def get_scenario_params(config: dict[str, Any]) -> dict[str, Any]:
    """Extract scenario parameters from config."""
    return config.get("scenarios", {})


def get_transaction_params(config: dict[str, Any]) -> dict[str, Any]:
    """Extract transaction parameters from config."""
    return config.get("transactions", {})


def get_candidate_params(config: dict[str, Any]) -> dict[str, Any]:
    """Extract candidate parameters from config."""
    return config.get("candidates", {})
