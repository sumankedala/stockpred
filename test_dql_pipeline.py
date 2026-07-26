import numpy as np
import pandas as pd
from data_engine import fetch_ohlcv, fetch_macro_regime_features, fetch_fundamentals, get_sector_etf, fetch_sector_ohlcv
from feature_engineering import build_feature_matrix
from ml_pipeline import train_and_validate, HORIZON_MAP, get_horizon_days, build_target, build_triple_barrier_target, get_model_instance

def run_test():
    print("Fetching AAPL data (5y)...")
    symbol = "AAPL"
    horizon_label = "1M"
    
    # 1. Fetch data
    ohlcv = fetch_ohlcv(symbol, period="5y")
    if ohlcv.empty:
        print("Error: fetched empty data")
        return
        
    print(f"Data fetched: {len(ohlcv)} rows.")
    
    # 2. Fundamentals, sentiment and sector ETF
    print("Fetching fundamentals and sector data...")
    fundamentals = fetch_fundamentals(symbol)
    sentiment_score = 0.1
    sector_etf = get_sector_etf(symbol)
    sector_ohlcv = fetch_sector_ohlcv(sector_etf, period="2y")
    
    # 3. Macro regime
    print("Fetching macro regime features...")
    macro_df = fetch_macro_regime_features(ohlcv.index, period="5y")
    print(f"Macro features shape: {macro_df.shape}")
    
    # 4. Build features matrix
    print("Building feature matrix...")
    X = build_feature_matrix(
        ohlcv,
        fundamentals,
        sentiment_score,
        sector_ohlcv=sector_ohlcv,
        macro_features=macro_df
    )
    print(f"Features shape: {X.shape}")
    
    # 5. Targets
    horizon_days = get_horizon_days(horizon_label)
    aligned_close = ohlcv["Close"].reindex(X.index)
    y_reg = build_target(aligned_close, horizon_days)
    
    # Let's run train_and_validate for models
    models_to_test = ["Ensemble", "iTransformer", "CNN-LSTM/BiLSTM", "GBM-KF"]
    
    for model_name in models_to_test:
        print(f"\n--- Training and evaluating: {model_name} (Regression Target) ---")
        try:
            model_dict, backtest_df, mape, mda, scaler = train_and_validate(
                X,
                y_reg,
                horizon_label,
                symbol,
                model_type=model_name,
                use_triple_barrier=False
            )
            print(f"{model_name} (Regression) -> MDA: {mda:.2f}%, MAPE: {mape:.2f}%")
            print(f"Sample predictions (first 5):\n{backtest_df.head(5)}")
        except Exception as e:
            print(f"Error training {model_name}: {e}")
            import traceback
            traceback.print_exc()
            
    # Test Triple-Barrier too
    y_tb = build_triple_barrier_target(
        aligned_close,
        horizon_days=horizon_days,
    )
    for model_name in models_to_test:
        print(f"\n--- Training and evaluating: {model_name} (Triple-Barrier Target) ---")
        try:
            model_dict, backtest_df, mape, mda, scaler = train_and_validate(
                X,
                y_tb,
                horizon_label,
                symbol,
                model_type=model_name,
                use_triple_barrier=True
            )
            print(f"{model_name} (Triple-Barrier) -> MDA: {mda:.2f}%, MAPE: {mape:.2f}%")
            print(f"Sample predictions (first 5):\n{backtest_df.head(5)}")
        except Exception as e:
            print(f"Error training {model_name}: {e}")

if __name__ == "__main__":
    run_test()
