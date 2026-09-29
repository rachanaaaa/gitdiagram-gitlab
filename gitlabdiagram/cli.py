from __future__ import annotations

import argparse

from gitlabdiagram.diagram_pipeline import generate_diagram_image


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate a repository diagram SVG image")
    parser.add_argument("--repository-url", required=True, help="GitHub or GitLab repository URL")
    parser.add_argument("--output-path", help="Where to write the generated SVG")
    parser.add_argument("--token", help="Provider-matched access token for private repositories")
    parser.add_argument("--max-files", type=int, default=12, help="Maximum number of file entries to draw")
    parser.add_argument("--width", type=int, default=1200, help="SVG width in pixels")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    result = generate_diagram_image(
        repository_url=args.repository_url,
        token=args.token,
        output_path=args.output_path,
        max_files=args.max_files,
        width=args.width,
    )
    print(result.output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
