import subprocess
import sys
import os

def main():
    # Make sure we are in the right working directory
    project_dir = r"C:\Users\MSI\.gemini\antigravity\scratch\space-intelligence-dashboard"
    os.chdir(project_dir)
    
    print("Executing Idris 2 Subsystem Safety unit tests inside the running Docker container...")
    cmd = ["docker", "compose", "exec", "isro-dashboard", "node", "verify_subsystems.js"]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
        print(proc.stdout)
        print("\n[ALL PASS] Python wrapper successfully verified subsystem safety constraints.")
    except Exception as e:
        print(f"Failed to execute verification inside container: {e}")
        if hasattr(e, 'stdout') and e.stdout:
            print("Stdout:")
            print(e.stdout)
        if hasattr(e, 'stderr') and e.stderr:
            print("Stderr:")
            print(e.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
