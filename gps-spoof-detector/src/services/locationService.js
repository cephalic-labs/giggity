import * as Location from 'expo-location';

export const getLocationData = async () => {
  // Ask permission
  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== 'granted') {
    throw new Error("Permission denied");
  }

  // Get location
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  return location;
};