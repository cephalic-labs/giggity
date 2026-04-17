import React, { useState } from "react";
import {
  View,
  Text,
  Button,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import * as Location from "expo-location";

export default function HomeScreen() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const checkSpoof = async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        alert("Permission denied");
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const isMock = location.mocked || false;

      const coords = `Lat: ${location.coords.latitude}, Lng: ${location.coords.longitude}`;

      if (isMock) {
        setResult({
          type: "spoofed",
          spoofed: coords,
        });
      } else {
        setResult({
          type: "real",
          current: coords,
        });
      }
    } catch (error) {
      alert("Error fetching location: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GPS Spoof Detector</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <Button
          title="Check Location"
          onPress={checkSpoof}
          disabled={loading}
        />
      )}

      {result && (
        <View style={styles.card}>
          {result.type === "real" ? (
            <>
              <Text style={styles.safe}>✅ Not Spoofed</Text>
              <Text style={styles.text}>
                Current Location = {result.current}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.spoofed}>⚠️ Spoofed</Text>
              <Text style={styles.text}>
                Spoofed Location = {result.spoofed}
              </Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 22,
    textAlign: "center",
    marginBottom: 20,
    fontWeight: "bold",
    color: "#000000",
  },
  card: {
    marginTop: 20,
    padding: 15,
    borderRadius: 10,
    backgroundColor: "#f2f2f2",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  text: {
    color: "#000000",
    marginVertical: 4,
    fontSize: 16,
  },
  spoofed: {
    color: "red",
    fontWeight: "bold",
    marginBottom: 8,
    fontSize: 18,
  },
  safe: {
    color: "green",
    fontWeight: "bold",
    marginBottom: 8,
    fontSize: 18,
  },
});
