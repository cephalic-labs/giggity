import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function LocationCard({ result }) {
  if (!result) return null;

  return (
    <View style={styles.card}>
      {result.isMock ? (
        <>
          <Text style={styles.spoofed}>⚠️ Spoofed Location</Text>
          <Text style={styles.text}>Original Location = {result.original}</Text>
          <Text style={styles.text}>Spoofed Location = {result.spoofed}</Text>
        </>
      ) : (
        <>
          <Text style={styles.safe}>✅ Not Spoofed</Text>
          <Text style={styles.text}>Current Location = {result.current}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 20,
    padding: 15,
    borderRadius: 10,
    backgroundColor: "#f2f2f2",
  },
  text: {
    color: "#333333",
    marginVertical: 4,
  },
  spoofed: {
    color: "red",
    fontWeight: "bold",
    marginBottom: 8,
  },
  safe: {
    color: "green",
    fontWeight: "bold",
    marginBottom: 8,
  },
});
