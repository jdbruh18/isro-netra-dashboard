import json

transcript_path = r"C:\Users\MSI\.gemini\antigravity\brain\30cddb88-085e-4f16-bdc7-42cdd3463657\.system_generated\logs\transcript.jsonl"

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            content = data.get("content") or ""
            step = data.get("step_index")
            source = data.get("source")
            if any(t in content.lower() for t in ["sprint", "roadmap"]):
                print(f"=== STEP {step} ({source}) ===")
                for line in content.split('\n'):
                    if any(t in line.lower() for t in ["sprint", "roadmap"]):
                        print(line)
                print("-" * 50)
        except Exception as e:
            pass
