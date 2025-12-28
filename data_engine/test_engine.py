from engine import DataEngine

print("Starting Data Engine test...")

engine = DataEngine()

df = engine.load("./data_engine\\sample_data.csv")
print("\nLoaded Data:")
print(df)

profile = engine.profile(df)
print("\nProfile:")
print(profile)

df = engine.clean(df)
print("\nCleaned Data:")
print(df)

engine.export(df, "output.csv")

print("\n✅ Engine test completed successfully")
