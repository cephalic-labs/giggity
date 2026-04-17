import React, { useState } from "react";
import {
  View,
  Text,
  Button,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import * as Location from "expo-location";

import { getLocationData } from "./src/services/locationService";
import { formatCoords } from "./src/utils/formatLocation";
import LocationCard from "./src/components/LocationCard";

export default function App() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const checkSpoof = async () => {
    setLoading(true);
    try {
      const location = await getLocationData();

      const isMock = location.mocked || false;
      // Expo uses `mocked` instead of isMock()

      const coords = formatCoords(location.coords);

      if (isMock) {
        setResult({
          isMock: true,
          original: "Unknown (cannot reliably fetch real location)",
          spoofed: coords,
        });
      } else {
        setResult({
          isMock: false,
          current: coords,
        });
      }
    } catch (error) {
      alert(error.message);
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

      <LocationCard result={result} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 22,
    textAlign: "center",
    marginBottom: 20,
    fontWeight: "bold",
  },
});
