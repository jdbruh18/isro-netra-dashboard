import sys
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.options import Options

def check_logs():
    print("Initializing headless Chrome browser...")
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    
    # Enable log capture
    chrome_options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})

    try:
        driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
    except Exception as e:
        print(f"Failed to start Chrome via Selenium: {e}")
        sys.exit(1)

    url = "http://localhost:8080"
    print(f"Navigating to dashboard at: {url}")
    try:
        driver.get(url)
        time.sleep(2)  # Wait for initial scripts to run
        
        print("Locating 2D TRACK button...")
        btn_2d = driver.find_element(By.ID, "btn-toggle-2d")
        print(f"Button info: Displayed={btn_2d.is_displayed()}, Size={btn_2d.size}, Location={btn_2d.location}")
        
        print("Clicking 2D TRACK button via JavaScript execution...")
        driver.execute_script("arguments[0].click();", btn_2d)
        
        time.sleep(1)  # Wait for DOM switch / layout calculation
        
        print("\n--- Browser Console Logs ---")
        logs = driver.get_log('browser')
        for entry in logs:
            print(f"[{entry['level']}] {entry['message']}")
            
        print("----------------------------\n")
        
    except Exception as e:
        print(f"Error during browser interaction: {e}")
    finally:
        driver.quit()

if __name__ == "__main__":
    check_logs()
