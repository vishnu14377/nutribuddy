import React, { useContext, useState } from 'react'
import Home from './pages/Home/Home'
import Footer from './components/Footer/Footer'
import Navbar from './components/Navbar/Navbar'
import { Route, Routes } from 'react-router-dom'
import Cart from './pages/Cart/Cart'
import LoginPopup from './components/LoginPopup/LoginPopup'
import PlaceOrder from './pages/PlaceOrder/PlaceOrder'
import MyOrders from './pages/MyOrders/MyOrders'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import Verify from './pages/Verify/Verify'
import Restaurants from './pages/Restaurants/Restaurants'
import RestaurantDetail from './pages/RestaurantDetail/RestaurantDetail'
import TrackOrder from './pages/TrackOrder/TrackOrder'
import Profile from './pages/Profile/Profile'
import Search from './pages/Search/Search'
import FoodDetail from './pages/FoodDetail/FoodDetail'
import { StoreContext } from './Context/StoreContext'
import { SocketProvider } from './Context/SocketContext.jsx'
import FloatingCart from './components/FloatingCart/FloatingCart'

const AppContent = () => {
  const [showLogin, setShowLogin] = useState(false)
  const { user } = useContext(StoreContext)

  return (
    <SocketProvider userId={user?.id} driverId={null}>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} pauseOnHover theme="light" />
      {showLogin && <LoginPopup setShowLogin={setShowLogin} />}
      <div className='app'>
        <Navbar setShowLogin={setShowLogin} />
        <Routes>
          <Route path='/'                      element={<Home />} />
          <Route path='/restaurants'           element={<Restaurants />} />
          <Route path='/restaurant/:id'        element={<RestaurantDetail />} />
          <Route path='/food/:id'              element={<FoodDetail />} />
          <Route path='/cart'                  element={<Cart />} />
          <Route path='/order'                 element={<PlaceOrder />} />
          <Route path='/myorders'              element={<MyOrders />} />
          <Route path='/track/:orderId'        element={<TrackOrder />} />
          <Route path='/profile'               element={<Profile />} />
          <Route path='/search'                element={<Search />} />
          <Route path='/verify'                element={<Verify />} />
        </Routes>
        <FloatingCart setShowLogin={setShowLogin} />
      </div>
      <Footer />
    </SocketProvider>
  )
}

const App = () => <AppContent />

export default App
