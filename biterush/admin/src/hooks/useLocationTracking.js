import { useEffect, useRef } from 'react';
import axios from 'axios';

/**
 * Custom hook to track driver location and send updates to the server.
 * @param {string} url - Base URL for API
 * @param {string} token - Auth token
 * @param {boolean} isActive - Whether tracking should be active (online + active order)
 */
const useLocationTracking = (url, token, isActive) => {
    const watchId = useRef(null);
    const lastUpdate = useRef(0);
    const UPDATE_INTERVAL = 15000; // 15 seconds

    useEffect(() => {
        if (!isActive || !token || !url) {
            if (watchId.current !== null) {
                navigator.geolocation.clearWatch(watchId.current);
                watchId.current = null;
            }
            return;
        }

        if (!navigator.geolocation) {
            console.error("Geolocation not supported");
            return;
        }

        const sendUpdate = async (latitude, longitude) => {
            const now = Date.now();
            if (now - lastUpdate.current < UPDATE_INTERVAL) return;

            try {
                await axios.post(`${url}/api/delivery/update-location`, 
                { latitude, longitude },
                { headers: { Authorization: `Bearer ${token}` } }
                );
                lastUpdate.current = now;
            } catch (error) {
                console.error("Failed to update location:", error);
            }
        };

        watchId.current = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                sendUpdate(latitude, longitude);
            },
            (error) => {
                console.error("Location tracking error:", error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 30000,
            }
        );

        return () => {
            if (watchId.current !== null) {
                navigator.geolocation.clearWatch(watchId.current);
            }
        };
    }, [url, token, isActive]);
};

export default useLocationTracking;
