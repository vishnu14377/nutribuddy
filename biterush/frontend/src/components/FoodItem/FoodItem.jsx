import React, { useContext } from 'react'
import './FoodItem.css'
import { assets } from '../../assets/assets'
import { StoreContext } from '../../Context/StoreContext'
import { useNavigate } from 'react-router-dom'

const FoodItem = ({ image, name, price, desc , id }) => {

    const {cartItems,addToCart,removeFromCart,currency,BASE_IMAGE_URL} = useContext(StoreContext)
    const navigate = useNavigate()
    const imageSrc = image?.startsWith('http') ? image : `${BASE_IMAGE_URL}${image}`
    const openDetails = () => navigate(`/food/${id}`)
    const handleKeyDown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openDetails()
        }
    }
    const handleCartClick = (event, action) => {
        event.stopPropagation()
        action(id)
    }

    return (
        <article className='food-item' onClick={openDetails} onKeyDown={handleKeyDown} role="button" tabIndex="0" aria-label={`View details for ${name}`}>
            <div className='food-item-img-container'>
                <img className='food-item-image' src={imageSrc} alt={name} />
                {!cartItems[id]
                ?<button className='add' onClick={(event) => handleCartClick(event, addToCart)} onKeyDown={(event) => event.stopPropagation()} aria-label={`Add ${name} to cart`}>
                    <img src={assets.add_icon_white} alt="" />
                </button>
                :<div className="food-item-counter" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                        <button onClick={(event)=>handleCartClick(event, removeFromCart)} aria-label={`Remove ${name} from cart`}>
                            <img src={assets.remove_icon_red} alt="" />
                        </button>
                        <p>{cartItems[id]}</p>
                        <button onClick={(event)=>handleCartClick(event, addToCart)} aria-label={`Add another ${name} to cart`}>
                            <img src={assets.add_icon_green} alt="" />
                        </button>
                    </div>
                }
            </div>
            <div className="food-item-info"> 
                <div className="food-item-name-rating">
                    <p>{name}</p> <img src={assets.rating_starts} alt="" />
                </div>
                <p className="food-item-desc">{desc}</p>
                <p className="food-item-price">{currency}{price}</p>
            </div>
        </article>
    )
}

export default FoodItem
