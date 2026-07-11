import React, { useContext, useEffect, useMemo, useState } from 'react'
import './Cart.css'
import { StoreContext } from '../../Context/StoreContext'
import { useNavigate } from 'react-router-dom'

const Cart = () => {
  const {
    cartItems,
    food_list,
    addToCart,
    removeFromCart,
    getTotalCartAmount,
    currency,
    deliveryCharge,
    BASE_IMAGE_URL,
  } = useContext(StoreContext)
  const navigate = useNavigate()

  const cartProducts = useMemo(
    () => food_list.filter((item) => cartItems[item._id] > 0),
    [food_list, cartItems]
  )

  const [selectedItemId, setSelectedItemId] = useState('')

  useEffect(() => {
    if (!cartProducts.length) {
      setSelectedItemId('')
      return
    }

    const selectedStillExists = cartProducts.some((item) => item._id === selectedItemId)
    if (!selectedStillExists) {
      setSelectedItemId(cartProducts[0]._id)
    }
  }, [cartProducts, selectedItemId])

  const selectedItem = cartProducts.find((item) => item._id === selectedItemId) || null
  const subtotal = getTotalCartAmount()
  const total = subtotal === 0 ? 0 : subtotal + deliveryCharge

  if (!cartProducts.length) {
    return (
      <div className="cart cart-empty-state">
        <div className="cart-empty-copy">
          <h2>Your cart is empty</h2>
          <p>Pick something delicious and it will show up here.</p>
          <button onClick={() => navigate('/')}>Browse food</button>
        </div>
      </div>
    )
  }

  return (
    <div className="cart">
      <div className="cart-header">
        <div>
          <h2>Your cart</h2>
          <p>{cartProducts.length} dish{cartProducts.length !== 1 ? 'es' : ''} ready for checkout</p>
        </div>
      </div>

      <div className="cart-layout">
        <section className="cart-items" aria-label="Cart items">
          {cartProducts.map((item) => {
            const quantity = cartItems[item._id]
            const imageSrc = item.image?.startsWith('http') ? item.image : `${BASE_IMAGE_URL}${item.image}`
            const isActive = item._id === selectedItemId

            return (
              <article
                key={item._id}
                className={`cart-item-card ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedItemId(item._id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedItemId(item._id)
                  }
                }}
                role="button"
                tabIndex="0"
              >
                <img src={imageSrc} alt={item.name} className="cart-item-image" />
                <div className="cart-item-copy">
                  <div className="cart-item-topline">
                    <p className="cart-item-name">{item.name}</p>
                    <span className="cart-item-category">{item.category}</span>
                  </div>
                  <p className="cart-item-desc">{item.description}</p>
                  <div className="cart-item-meta">
                    <span>{currency}{item.price} each</span>
                    <span>{currency}{item.price * quantity} total</span>
                  </div>
                </div>
                <div className="cart-item-actions">
                  <div className="cart-qty-control" onClick={(event) => event.stopPropagation()}>
                    <button type="button" onClick={() => removeFromCart(item._id)} aria-label={`Remove one ${item.name}`}>
                      -
                    </button>
                    <span>{quantity}</span>
                    <button type="button" onClick={() => addToCart(item._id)} aria-label={`Add one ${item.name}`}>
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className="cart-remove-btn"
                    onClick={(event) => {
                      event.stopPropagation()
                      for (let i = 0; i < quantity; i += 1) removeFromCart(item._id)
                    }}
                  >
                    Remove
                  </button>
                </div>
              </article>
            )
          })}
        </section>

        <aside className="cart-sidebar">
          {selectedItem && (
            <section className="cart-detail" aria-label="Selected food details">
              <img
                src={selectedItem.image?.startsWith('http') ? selectedItem.image : `${BASE_IMAGE_URL}${selectedItem.image}`}
                alt={selectedItem.name}
                className="cart-detail-image"
              />
              <div className="cart-detail-body">
                <div className="cart-detail-heading">
                  <div>
                    <p className="cart-detail-category">{selectedItem.category}</p>
                    <h3>{selectedItem.name}</h3>
                  </div>
                  <span className="cart-detail-price">{currency}{selectedItem.price}</span>
                </div>
                <p className="cart-detail-description">{selectedItem.description}</p>
                <div className="cart-detail-facts">
                  <div>
                    <span className="detail-label">Quantity</span>
                    <strong>{cartItems[selectedItem._id]}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Item total</span>
                    <strong>{currency}{selectedItem.price * cartItems[selectedItem._id]}</strong>
                  </div>
                </div>
                <button type="button" className="cart-detail-link" onClick={() => navigate(`/food/${selectedItem._id}`)}>
                  View full food page
                </button>
              </div>
            </section>
          )}

          <section className="cart-total">
            <h3>Order summary</h3>
            <div className="cart-total-details"><p>Subtotal</p><p>{currency}{subtotal}</p></div>
            <div className="cart-total-details"><p>Delivery fee</p><p>{currency}{subtotal === 0 ? 0 : deliveryCharge}</p></div>
            <div className="cart-total-details total-line"><b>Total</b><b>{currency}{total}</b></div>
            <button type="button" onClick={() => navigate('/order')}>Proceed to checkout</button>
          </section>
        </aside>
      </div>
    </div>
  )
}

export default Cart
