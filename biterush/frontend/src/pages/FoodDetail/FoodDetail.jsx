import React, { useContext } from 'react'
import './FoodDetail.css'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { StoreContext } from '../../Context/StoreContext'
import FoodItem from '../../components/FoodItem/FoodItem'

const FoodDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { food_list, cartItems, addToCart, removeFromCart, currency, BASE_IMAGE_URL } = useContext(StoreContext)
  const food = food_list.find((item) => item._id === id)

  if (!food && food_list.length === 0) {
    return <div className="food-detail-state">Finding fresh details...</div>
  }

  if (!food) {
    return (
      <div className="food-detail-state">
        <h1>This dish is off the menu.</h1>
        <p>Try another BiteRush favorite from the menu.</p>
        <button onClick={() => navigate('/')}>Back to Menu</button>
      </div>
    )
  }

  const imageSrc = food.image?.startsWith('http') ? food.image : `${BASE_IMAGE_URL}${food.image}`
  const relatedItems = food_list
    .filter((item) => item.category === food.category && item._id !== food._id)
    .slice(0, 4)

  return (
    <main className="food-detail">
      <Link className="food-detail-back" to="/">Back to menu</Link>

      <section className="food-detail-hero">
        <div className="food-detail-image-wrap">
          <img src={imageSrc} alt={food.name} />
        </div>

        <div className="food-detail-content">
          <p className="food-detail-kicker">{food.category}</p>
          <h1>{food.name}</h1>
          <p className="food-detail-desc">{food.description}</p>

          <div className="food-detail-meta">
            <span>4.8 rating</span>
            <span>25-35 min</span>
            <span>Freshly packed</span>
          </div>

          <div className="food-detail-price-row">
            <p>{currency}{food.price}</p>
            {!cartItems[id] ? (
              <button onClick={() => addToCart(id)}>Add to Cart</button>
            ) : (
              <div className="food-detail-counter">
                <button onClick={() => removeFromCart(id)}>-</button>
                <span>{cartItems[id]}</span>
                <button onClick={() => addToCart(id)}>+</button>
              </div>
            )}
          </div>

          <div className="food-detail-notes">
            <div>
              <span>Great for</span>
              <p>Quick lunches, easy dinners, and no-fuss cravings.</p>
            </div>
            <div>
              <span>BiteRush promise</span>
              <p>Checked kitchen prep, clear order updates, and warm handoff.</p>
            </div>
          </div>
        </div>
      </section>

      {relatedItems.length > 0 && (
        <section className="food-detail-related">
          <h2>More {food.category} picks</h2>
          <div className="food-detail-related-list">
            {relatedItems.map((item) => (
              <FoodItem
                key={item._id}
                image={item.image}
                name={item.name}
                desc={item.description}
                price={item.price}
                id={item._id}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

export default FoodDetail
