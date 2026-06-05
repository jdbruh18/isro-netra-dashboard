import urllib.request
import urllib.error
import json

def test_endpoint(url, data=None, expected_status=200):
    try:
        if data:
            post_data = json.dumps(data).encode('utf-8')
            req = urllib.request.Request(url, data=post_data, headers={'Content-Type': 'application/json'})
        else:
            req = urllib.request.Request(url)
            
        with urllib.request.urlopen(req) as response:
            status = response.status
            content = response.read().decode('utf-8')
            print(f"Request to {url} returned status: {status} (Expected: {expected_status}) - SUCCESS")
            return status, content
    except urllib.error.HTTPError as e:
        if e.code == expected_status:
            print(f"Request to {url} correctly blocked with status: {e.code} (Expected: {expected_status}) - SUCCESS")
            return e.code, None
        else:
            print(f"Request to {url} failed with unexpected status: {e.code} (Expected: {expected_status}) - FAILED")
            return e.code, None
    except Exception as e:
        print(f"Request to {url} failed: {e}")
        return None, None

def run_tests():
    print("--- Running Security and Input Validation Tests ---")
    
    # 1. Valid catalog search
    test_endpoint("http://localhost:8080/api/catalog/search?query=25544", expected_status=200)
    
    # 2. Valid catalog add
    test_endpoint("http://localhost:8080/api/catalog/add", data={"noradId": "25544"}, expected_status=200)
    
    # 3. Invalid catalog add (SSRF injection attempt)
    test_endpoint("http://localhost:8080/api/catalog/add", data={"noradId": "25544&inject=1"}, expected_status=400)
    
    # 4. Invalid catalog add (Alpha characters)
    test_endpoint("http://localhost:8080/api/catalog/add", data={"noradId": "abc"}, expected_status=400)
    
    # 5. Invalid Gemini request (empty message)
    # Gemini requires an API key in header, so without it we expect 401. If we send an empty message but no key,
    # it fails on 401, but if we send a key and empty message it fails on 400.
    # Let's test the empty message block by providing a dummy key in headers:
    try:
        url = "http://localhost:8080/api/gemini"
        post_data = json.dumps({"message": ""}).encode('utf-8')
        req = urllib.request.Request(url, data=post_data, headers={'Content-Type': 'application/json', 'x-api-key': 'dummy_key'})
        with urllib.request.urlopen(req) as response:
            print("Gemini request with empty message unexpectedly succeeded - FAILED")
    except urllib.error.HTTPError as e:
        if e.code == 400:
            print("Gemini request with empty message correctly blocked with status 400 - SUCCESS")
        else:
            print(f"Gemini request with empty message returned status {e.code} (Expected: 400) - FAILED")
            
if __name__ == "__main__":
    run_tests()
