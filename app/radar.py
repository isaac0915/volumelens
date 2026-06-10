import time
from fugle_marketdata import RestClient

# Initialize Fugle Client
# WARNING: Keep your real API key safe! Do not commit it to GitHub.
FUGLE_API_KEY = "ZjA4ODAyMzYtNTk5My00ZmRjLTk0MDUtN2VhYjcxNzMzMWFiIDIwMTVhMTc0LTJiOGYtNGNlYy1iYjczLTFjZDUzNWI5N2NmNw" # Replace with your key, or use "demo" for 2884
client = RestClient(api_key=FUGLE_API_KEY)

SYMBOL = "2884" # Use "2884" if using demo key, otherwise try "2330"
CHECK_INTERVAL = 5 # Check every 5 seconds
SURGE_THRESHOLD = 0.5 # Alert if price changes by more than 0.5% between checks

print(f"🚀 Starting Real-time Radar for {SYMBOL}...")
print("-" * 40)

previous_price = None

while True:
    try:
        # Fetch the latest quote
        quote_data = client.stock.intraday.quote(symbol=SYMBOL)
        current_price = quote_data.get("lastPrice")
        
        if current_price:
            if previous_price is None:
                print(f"Initial Price Set: {current_price}")
            else:
                # Calculate percentage change
                change_percent = ((current_price - previous_price) / previous_price) * 100
                
                # Print the heartbeat status
                print(f"Current Price: {current_price} | Change: {change_percent:+.2f}%")
                
                # Trigger Alert if threshold is breached
                if abs(change_percent) >= SURGE_THRESHOLD:
                    print("\n" + "🚨" * 5)
                    print(f"WARNING: Price Surge Detected! Change: {change_percent:+.2f}%")
                    print("🚨" * 5 + "\n")
            
            # Update the state
            previous_price = current_price
            
        # Sleep before the next check to avoid hitting API rate limits
        time.sleep(CHECK_INTERVAL)

    except Exception as e:
        print(f"Error fetching data: {e}")
        time.sleep(CHECK_INTERVAL)