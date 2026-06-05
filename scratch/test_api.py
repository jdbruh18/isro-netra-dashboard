import urllib.request
import json

def test_api():
    print("Testing Catalog Search for NORAD ID 25544 (ISS)...")
    try:
        url = "http://localhost:8080/api/catalog/search?query=25544"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            res_data = response.read().decode('utf-8')
            data = json.loads(res_data)
            print(f"Search Success! Found {len(data)} results.")
            if len(data) > 0:
                print(f"First match: {data[0].get('OBJECT_NAME')} | ID: {data[0].get('NORAD_CAT_ID')}")
            else:
                print("No results returned.")
                return
    except Exception as e:
        print(f"Search API request failed: {e}")
        return

    print("\nTesting Catalog Add for ISS...")
    try:
        url = "http://localhost:8080/api/catalog/add"
        post_data = json.dumps({"noradId": 25544}).encode('utf-8')
        req = urllib.request.Request(url, data=post_data, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req) as response:
            res_data = response.read().decode('utf-8')
            data = json.loads(res_data)
            print(f"Add Success! Satellite added: {data.get('name')} (ID: {data.get('id')})")
            print(f"Category: {data.get('category')}")
            print(f"TLE Line 1: {data.get('tle1')}")
            print(f"TLE Line 2: {data.get('tle2')}")
    except Exception as e:
        print(f"Add API request failed: {e}")

if __name__ == "__main__":
    test_api()
