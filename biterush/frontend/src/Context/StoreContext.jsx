import { createContext, useEffect, useState } from "react";
import api, { BASE_IMAGE_URL } from "../services/api.js";
import { menu_list } from "../assets/assets.js";

export const StoreContext = createContext(null);

const StoreContextProvider = (props) => {
  const url = "http://localhost:4000";
  const [food_list,  setFoodList]  = useState([]);
  const [cartItems,  setCartItems] = useState({});
  const [token,      setToken]     = useState("");
  const [user,       setUser]      = useState(null);
  const currency    = "₹";
  const deliveryCharge = 50;

  // ─── Cart operations ───────────────────────────────────────────────────────
  const addToCart = async (itemId) => {
    setCartItems((prev) => ({ ...prev, [itemId]: (prev[itemId] || 0) + 1 }));
    if (token) {
      await api.post("/cart/add", { itemId }).catch(() => {});
    }
  };

  const removeFromCart = async (itemId) => {
    setCartItems((prev) => ({ ...prev, [itemId]: Math.max(0, (prev[itemId] || 1) - 1) }));
    if (token) {
      await api.post("/cart/remove", { itemId }).catch(() => {});
    }
  };

  const getTotalCartAmount = () => {
    return Object.entries(cartItems).reduce((total, [itemId, qty]) => {
      if (qty <= 0) return total;
      const item = food_list.find((f) => f._id === itemId);
      return item ? total + item.price * qty : total;
    }, 0);
  };

  const clearCart = () => setCartItems({});

  // ─── Data fetching ─────────────────────────────────────────────────────────
  const fetchFoodList = async () => {
    try {
      const res = await api.get("/food/list");
      setFoodList(res.data.data);
    } catch {}
  };

  const loadCartData = async () => {
    try {
      const res = await api.post("/cart/get", {});
      setCartItems(res.data.cartData || {});
    } catch {}
  };

  // ─── Auth helpers ──────────────────────────────────────────────────────────
  const login = (tokenVal, refreshTokenVal, userData) => {
    setToken(tokenVal);
    setUser(userData);
    localStorage.setItem("token",        tokenVal);
    localStorage.setItem("refreshToken", refreshTokenVal || "");
    localStorage.setItem("user",         JSON.stringify(userData));
  };

  const logout = async () => {
    try { await api.post("/user/logout"); } catch {}
    setToken("");
    setUser(null);
    setCartItems({});
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
  };

  // ─── App init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    const savedUser  = localStorage.getItem("user");
    if (savedToken) {
      setToken(savedToken);
      if (savedUser) setUser(JSON.parse(savedUser));
    }
    fetchFoodList();
    if (savedToken) loadCartData();
  }, []);

  const contextValue = {
    url,
    food_list,
    cartItems,
    setCartItems,
    addToCart,
    removeFromCart,
    getTotalCartAmount,
    clearCart,
    token,
    setToken,
    user,
    setUser,
    login,
    logout,
    loadCartData,
    currency,
    deliveryCharge,
    BASE_IMAGE_URL,
    menu_list,
  };

  return (
    <StoreContext.Provider value={contextValue}>
      {props.children}
    </StoreContext.Provider>
  );
};

export default StoreContextProvider;