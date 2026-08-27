"""CLI entry point for synthetic data generation.

Usage:
    python scripts/generate_data.py [--seed SEED] [--config PATH] [--output DIR]
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.data_generation.generator import generate_dataset


def main() -> None:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Generate synthetic investigation data for SENTINEL MVP"
    )
    parser.add_argument(
        "--seed", type=int, default=None,
        help="Random seed for reproducibility"
    )
    parser.add_argument(
        "--config", type=str, default=None,
        help="Path to config YAML file"
    )
    parser.add_argument(
        "--output", type=str, default=None,
        help="Output directory for generated data"
    )
    parser.add_argument(
        "--verbose", action="store_true",
        help="Enable verbose logging"
    )

    args = parser.parse_args()

    # Configure logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    try:
        results = generate_dataset(
            config_path=args.config,
            output_dir=args.output,
            seed=args.seed,
        )

        print("\n" + "=" * 60)
        print("SENTINEL Synthetic Data Generation Complete")
        print("=" * 60)
        print(f"  Cases:              {results['case_count']}")
        print(f"  Accounts:           {results['account_count']}")
        print(f"  Transactions:       {results['transaction_count']}")
        print(f"  Locations:          {results['location_count']}")
        print(f"  Candidates:         {results['candidate_count']}")
        print(f"  Ground truths:      {results['ground_truth_count']}")
        print(f"  Random seed:        {results['seed']}")
        print(f"  Output directory:   {results['output_dir']}")
        print(f"\n  Scenario distribution:")
        for scenario, count in results["scenario_distribution"].items():
            print(f"    {scenario}: {count}")

        if results["validation_errors"]:
            print(f"\n  VALIDATION ERRORS: {len(results['validation_errors'])}")
            for err in results["validation_errors"]:
                print(f"    - {err}")
        else:
            print("\n  Validation: ALL CHECKS PASSED")

        print("=" * 60)

    except Exception as e:
        logging.error(f"Generation failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
