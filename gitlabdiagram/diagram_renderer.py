from __future__ import annotations

from html import escape

from gitlabdiagram.types import RepositoryData


def _truncate(value: str, max_length: int) -> str:
    return value if len(value) <= max_length else f"{value[: max_length - 1]}…"


def render_repository_diagram_svg(data: RepositoryData, *, max_files: int = 12, width: int = 1200) -> str:
    visible_files = data.files[:max_files]
    height = 220 + len(visible_files) * 28
    title = f"{data.project.owner}/{data.project.project}"
    description = data.project.description or "No description provided"
    readme_summary = _truncate(" ".join((data.readme or "No README detected").split()), 180)

    file_rows = "".join(
        f'\n    <rect x="64" y="{188 + index * 28}" width="{width - 128}" height="20" rx="6" fill="{"#E0E7FF" if file.type == "tree" else "#E5E7EB"}" />'
        f'\n    <text x="84" y="{202 + index * 28}" font-family="Inter, Arial, sans-serif" font-size="12" fill="#111827">{escape(file.path)}</text>'
        for index, file in enumerate(visible_files)
    )

    remaining_count = len(data.files) - len(visible_files)
    remaining_label = (
        f'<text x="64" y="{height - 24}" font-family="Inter, Arial, sans-serif" font-size="12" fill="#6B7280">+ {remaining_count} more files</text>'
        if remaining_count > 0
        else ""
    )

    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">
  <title id="title">Repository diagram for {escape(title)}</title>
  <desc id="desc">Diagram of {escape(title)} showing provider, branch, README summary, and top repository paths.</desc>
  <rect width="{width}" height="{height}" fill="#F8FAFC" />
  <rect x="32" y="24" width="{width - 64}" height="{height - 48}" rx="18" fill="#FFFFFF" stroke="#CBD5E1" />
  <text x="64" y="72" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" fill="#0F172A">{escape(title)}</text>
  <text x="64" y="100" font-family="Inter, Arial, sans-serif" font-size="14" fill="#475569">Provider: {escape(data.provider)} • Branch: {escape(data.branch)}</text>
  <text x="64" y="126" font-family="Inter, Arial, sans-serif" font-size="14" fill="#334155">{escape(_truncate(description, 120))}</text>
  <text x="64" y="152" font-family="Inter, Arial, sans-serif" font-size="13" fill="#64748B">README: {escape(readme_summary)}</text>
  <text x="64" y="178" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700" fill="#0F172A">Repository structure</text>{file_rows}
  {remaining_label}
</svg>'''
