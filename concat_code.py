import os
from pathlib import Path

# Target output directory
OUTPUT_DIR = Path("combined_code_v2")
OUTPUT_DIR.mkdir(exist_ok=True)

# Directories and patterns to skip
EXCLUDED_DIRS = {".venv", "venv", ".env", "env", "__pycache__", ".git", ".idea", ".vscode"}

# Full and half divider lines
LINE_FULL = "=" * 80
LINE_HALF = "-" * 40

def get_target_group_filename(file_path: Path, root_path: Path) -> str:
    """Determines which .txt file a .py script belongs to."""
    relative = file_path.relative_to(root_path)
    parts = relative.parts
    is_test = "test" in file_path.stem.lower() or any("test" in p.lower() for p in parts[:-1])

    if len(parts) == 1:
        # Root-level files (e.g., manage.py)
        return "tests_root.txt" if is_test else "root_config.txt"

    # Identify primary module or subfolder name
    # e.g., if app/volunteers/views.py -> group by "app_volunteers"
    if parts[0] == "app" and len(parts) > 2:
        group_name = f"app_{parts[1]}"
    else:
        group_name = parts[0]

    if is_test:
        return f"tests_{group_name}.txt"
    return f"{group_name}.txt"

def main():
    root = Path.cwd()
    merged_files = {}

    print(f"Scanning directory: {root}")

    for path in root.rglob("*.py"):
        # Skip if any parent folder is in the exclusion list
        if any(part in EXCLUDED_DIRS for part in path.parts):
            continue

        target_txt = get_target_group_filename(path, root)
        output_file_path = OUTPUT_DIR / target_txt

        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            print(f"Could not read {path}: {e}")
            continue

        with open(output_file_path, "a", encoding="utf-8") as out:
            out.write(f"{LINE_FULL}\n")
            out.write(f"{path.resolve()}\n")
            out.write(f"{LINE_HALF}\n")
            out.write(content.strip() + "\n\n")

        merged_files[target_txt] = merged_files.get(target_txt, 0) + 1

    print("\nExtraction complete! Files generated in 'combined_code_v2/':")
    for fname, count in merged_files.items():
        print(f"  - {fname}: {count} file(s) merged")

if __name__ == "__main__":
    main()