import os
import sqlite3
from typing import List, Dict

def export_to_markdowns():
    """Mengekspor memori ke semua target agen yang terdaftar di database."""
    db_path = os.path.expanduser("~/.amneshia/memory.db")
    if not os.path.exists(db_path):
        return

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        memories = conn.execute("SELECT * FROM memories ORDER BY created_at ASC").fetchall()
        targets = conn.execute("SELECT * FROM export_targets").fetchall()

    if not targets:
        return

    user_memories = []
    sys_memories = []

    for row in memories:
        mem_type = row['type']
        content = f"- **[{row['scope'].upper()}]**: {row['content']}\n"
        if mem_type in ['user', 'preference', 'story']:
            user_memories.append(content)
        else:
            sys_memories.append(content)

    user_md = "# User Profile / Global Preferences\n\n" + "".join(user_memories)
    sys_md = "# System & Working Memory\n\n" + "".join(sys_memories)

    for target in targets:
        target_dir = os.path.expanduser(target["path"])
        try:
            os.makedirs(target_dir, exist_ok=True)
            with open(os.path.join(target_dir, "USER.md"), "w") as f:
                f.write(user_md)
            with open(os.path.join(target_dir, "MEMORY.md"), "w") as f:
                f.write(sys_md)
        except Exception as e:
            print(f"Failed to export to {target['name']} ({target_dir}): {e}")
