import { createContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";

export const AdminContext = createContext(null);

const AdminContextProvider = (props) => {
  const url = "http://localhost:4000";
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [driverPartnerId, setDriverPartnerId] = useState(null);
  const [driverProfile, setDriverProfile] = useState(null);
  const [socket, setSocket] = useState(null);
  const currency = "₹";
  const locationWatchRef = useRef(null);

  const fetchUserRestaurant = async (authToken) => {
    try {
      const response = await axios.get(`${url}/api/restaurant/my`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const restaurant = response.data?.data?.[0] || null;
      setRestaurantId(restaurant?._id || null);
      return restaurant?._id || null;
    } catch {
      setRestaurantId(null);
      return null;
    }
  };

  const fetchDriverProfile = async (authToken = token) => {
    if (!authToken) return null;
    try {
      const response = await axios.get(`${url}/api/delivery/profile`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const profile = response.data?.data || null;
      setDriverProfile(profile);
      setDriverPartnerId(profile?._id || null);
      return profile || null;
    } catch {
      setDriverProfile(null);
      setDriverPartnerId(null);
      return null;
    }
  };

  const disconnectSocket = () => {
    setSocket((current) => {
      if (current) current.disconnect();
      return null;
    });
  };

  const initSocket = ({ authToken, userData, rid = null, partnerId = null }) => {
    if (!authToken || !userData) return;

    disconnectSocket();

    const newSocket = io(url, {
      auth: {
        token: authToken,
        userId: userData?._id,
        role: userData?.role,
        restaurantId: rid,
        driverId: partnerId,
      }
    });

    setSocket(newSocket);
  };

  const refreshPortalIdentity = async (authToken = token, userData = user) => {
    if (!authToken || !userData) return;

    let rid = null;
    let partnerId = null;

    if (userData.role === 'restaurant_owner') {
      rid = await fetchUserRestaurant(authToken);
    }

    if (userData.role === 'delivery_partner') {
      const profile = await fetchDriverProfile(authToken);
      partnerId = profile?._id || null;
    }

    initSocket({ authToken, userData, rid, partnerId });
  };

  const login = async (tokenVal, userData) => {
    setToken(tokenVal);
    setUser(userData);
    localStorage.setItem("admin_token", tokenVal);
    localStorage.setItem("admin_user", JSON.stringify(userData));
    await refreshPortalIdentity(tokenVal, userData);
  };

  const logout = () => {
    disconnectSocket();
    if (locationWatchRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }
    setToken("");
    setUser(null);
    setRestaurantId(null);
    setDriverPartnerId(null);
    setDriverProfile(null);
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_user");
  };

  useEffect(() => {
    const savedToken = localStorage.getItem("admin_token");
    const savedUserRaw = localStorage.getItem("admin_user");
    if (!savedToken || !savedUserRaw) return;

    const savedUser = JSON.parse(savedUserRaw);
    setToken(savedToken);
    setUser(savedUser);
    refreshPortalIdentity(savedToken, savedUser);
  }, []);

  useEffect(() => {
    const isDriver = user?.role === 'delivery_partner';
    const isOnline = driverProfile?.isOnline;
    const hasOrder = !!driverProfile?.currentOrderId;

    if (!isDriver || !token || !isOnline || !hasOrder) {
      if (locationWatchRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
        locationWatchRef.current = null;
      }
      return;
    }

    if (!navigator.geolocation) return;

    let lastUpdate = 0;
    const UPDATE_INTERVAL = 15000; // 15 seconds

    const sendLocation = async (position) => {
      const now = Date.now();
      if (now - lastUpdate < UPDATE_INTERVAL) return;

      try {
        await axios.post(`${url}/api/delivery/update-location`, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        lastUpdate = now;
      } catch {}
    };

    locationWatchRef.current = navigator.geolocation.watchPosition(
      sendLocation,
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => {
      if (locationWatchRef.current != null) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
        locationWatchRef.current = null;
      }
    };
  }, [user?.role, token, driverProfile?.isOnline, !!driverProfile?.currentOrderId]);

  const contextValue = {
    url,
    token,
    setToken,
    user,
    setUser,
    login,
    logout,
    currency,
    socket,
    restaurantId,
    driverPartnerId,
    driverProfile,
    refreshDriverProfile: fetchDriverProfile,
    refreshPortalIdentity,
  };

  return (
    <AdminContext.Provider value={contextValue}>
      {props.children}
    </AdminContext.Provider>
  );
};

export default AdminContextProvider;
