import React, { useContext, useEffect, useState } from 'react'
import './PlaceOrder.css'
import { StoreContext } from '../../Context/StoreContext'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import api from '../../services/api.js'

const PlaceOrder = () => {
  const [payment, setPayment] = useState("cod")
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    street: '',
    city: '',
    state: '',
    zipcode: '',
    country: 'India',
    phone: '',
    latitude: '',
    longitude: '',
  })
  const [locationStatus, setLocationStatus] = useState('idle')
  const { getTotalCartAmount, token, food_list, cartItems, setCartItems, currency, deliveryCharge, clearCart } = useContext(StoreContext)
  const navigate = useNavigate()

  const onChange = (e) => setData(d => ({ ...d, [e.target.name]: e.target.value }))

  const buildOrderItems = () =>
    food_list.filter(item => cartItems[item._id] > 0)
      .map(item => ({ itemId: item._id, name: item.name, price: item.price, quantity: cartItems[item._id], image: item.image }))

  const placeOrderCOD = async (orderData) => {
    const res = await api.post('/order/place', orderData)
    if (res.data.success) {
      clearCart()
      toast.success('Order placed successfully! 🎉')
      navigate('/myorders')
    } else { toast.error(res.data.message || 'Failed to place order') }
  }

  const placeOrderRazorpay = async (orderData) => {
    // Step 1: Get Razorpay key
    const keyRes = await api.get('/payment/razorpay/key')
    if (!keyRes.data.success) { toast.error('Payment service unavailable. Please use COD.'); return }

    // Step 2: Create Razorpay order on backend
    const rpRes = await api.post('/payment/razorpay/create-order', { amount: orderData.totalAmount })
    if (!rpRes.data.success) { toast.error('Could not initialize payment'); return }
    const { orderId: rpOrderId, amount, currency: rpCurrency } = rpRes.data.data

    // Step 3: Create our order record in pending state
    const ourOrder = await api.post('/order/place-razorpay', { ...orderData, razorpayOrderId: rpOrderId })
    if (!ourOrder.data.success) { toast.error('Order creation failed'); return }
    const ourOrderId = ourOrder.data.data._id

    // Step 4: Open Razorpay checkout
    const options = {
      key:         keyRes.data.keyId,
      amount:      amount,
      currency:    rpCurrency,
      name:        'BiteRush Food Delivery',
      description: 'Food Order Payment',
      order_id:    rpOrderId,
      handler: async (response) => {
        try {
          const verifyRes = await api.post('/payment/razorpay/verify', {
            razorpay_order_id:   response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature:  response.razorpay_signature,
            orderId:             ourOrderId,
          })
          if (verifyRes.data.success) {
            clearCart()
            toast.success('Payment successful! Order confirmed 🎉')
            navigate('/myorders')
          } else { toast.error('Payment verification failed') }
        } catch { toast.error('Payment verification error') }
      },
      prefill: { name: `${data.firstName} ${data.lastName}`, email: data.email, contact: data.phone },
      theme: { color: '#ff4f00' },
      modal: { ondismiss: () => toast.info('Payment cancelled') },
    }

    if (!window.Razorpay) {
      // Dynamically load Razorpay script
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => new window.Razorpay(options).open()
      document.body.appendChild(script)
    } else {
      new window.Razorpay(options).open()
    }
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const items  = buildOrderItems()
      if (!items.length) { toast.error('Cart is empty'); return }
      const subtotal = getTotalCartAmount()
      const orderData = {
        items,
        amount:      subtotal,
        totalAmount: subtotal + deliveryCharge,
        address:     data,
      }
      if (payment === 'cod') await placeOrderCOD(orderData)
      else await placeOrderRazorpay(orderData)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong')
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (!token) { toast.error('Please sign in to place an order'); navigate('/cart') }
    else if (getTotalCartAmount() === 0) navigate('/cart')
  }, [token])

  const captureCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Location is not supported on this device')
      return
    }

    setLocationStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setData((prev) => ({
          ...prev,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }))
        setLocationStatus('ready')
        toast.success('Current location added for faster driver assignment')
      },
      () => {
        setLocationStatus('error')
        toast.error('Could not fetch your location')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    )
  }

  const subtotal = getTotalCartAmount()

  return (
    <form onSubmit={onSubmit} className='place-order'>
      <div className="place-order-left">
        <h2 className='section-title'>📦 Delivery Information</h2>
        <div className="multi-field">
          <input name='firstName' onChange={onChange} value={data.firstName} placeholder='First Name' required />
          <input name='lastName'  onChange={onChange} value={data.lastName}  placeholder='Last Name' required />
        </div>
        <input name='email'   onChange={onChange} value={data.email}   type="email" placeholder='Email Address' required />
        <input name='street'  onChange={onChange} value={data.street}  placeholder='Street Address' required />
        <div className="multi-field">
          <input name='city'  onChange={onChange} value={data.city}  placeholder='City' required />
          <input name='state' onChange={onChange} value={data.state} placeholder='State' required />
        </div>
        <div className="multi-field">
          <input name='zipcode' onChange={onChange} value={data.zipcode} placeholder='PIN Code' required />
          <input name='country' onChange={onChange} value={data.country} placeholder='Country' required />
        </div>
        <input name='phone' onChange={onChange} value={data.phone} type="tel" placeholder='Phone Number' required />
        <div className="location-capture">
          <div className="location-info">
            <p className="location-title">📍 Delivery Location Pin</p>
            <p className="location-copy">
              {locationStatus === 'ready'
                ? `Coordinates captured: ${data.latitude}, ${data.longitude}`
                : 'Capture your precise location for faster delivery and real-time tracking.'}
            </p>
          </div>
          <button type="button" className={`location-btn ${locationStatus}`} onClick={captureCurrentLocation} disabled={locationStatus === 'loading'}>
            {locationStatus === 'loading' ? '⏳ Locating...' : locationStatus === 'ready' ? '✅ Refresh Pin' : '🎯 Use Current Location'}
          </button>
        </div>
      </div>

      <div className="place-order-right">
        <div className="cart-total">
          <h2>🧾 Order Summary</h2>
          <div className="cart-total-details"><p>Subtotal</p><p>{currency}{subtotal}</p></div>
          <hr />
          <div className="cart-total-details"><p>Delivery Fee</p><p>{currency}{subtotal === 0 ? 0 : deliveryCharge}</p></div>
          <hr />
          <div className="cart-total-details"><b>Total</b><b>{currency}{subtotal === 0 ? 0 : subtotal + deliveryCharge}</b></div>
        </div>

        <div className="payment">
          <h2>💳 Payment Method</h2>
          <div onClick={() => setPayment("cod")} className={`payment-option ${payment === 'cod' ? 'selected' : ''}`}>
            <span className="payment-radio">{payment === 'cod' ? '●' : '○'}</span>
            <div><p className="pay-title">Cash on Delivery</p><p className="pay-desc">Pay when your order arrives</p></div>
          </div>
          <div onClick={() => setPayment("razorpay")} className={`payment-option ${payment === 'razorpay' ? 'selected' : ''}`}>
            <span className="payment-radio">{payment === 'razorpay' ? '●' : '○'}</span>
            <div>
              <p className="pay-title">Razorpay <span className="pay-badge">UPI / Card / NetBanking</span></p>
              <p className="pay-desc">Secure online payment</p>
            </div>
          </div>
        </div>

        <button className='place-order-submit' type='submit' disabled={loading}>
          {loading ? '⏳ Processing...' : payment === 'cod' ? '🛵 Place Order' : '💳 Pay & Confirm'}
        </button>
      </div>
    </form>
  )
}

export default PlaceOrder
