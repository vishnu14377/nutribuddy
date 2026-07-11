import React from 'react'
import './Header.css'
import { Link } from 'react-router-dom'

const Header = () => {
    return (
        <section className='header'>
            <div className='header-contents'>
                <p className='header-eyebrow'>Fresh meals, fast drops</p>
                <h1>BiteRush brings your cravings closer.</h1>
                <p>Pick a mood, track every stop, and get warm favorites from nearby kitchens without the wait.</p>
                <div className='header-actions'>
                    <a className='header-cta' href="#explore-menu">Order Now</a>
                    <Link className='header-secondary' to="/restaurants">Browse Restaurants</Link>
                </div>
                <div className='header-proof'>
                    <span><strong>25 min</strong> average rush</span>
                    <span><strong>Live</strong> order tracking</span>
                    <span><strong>Fresh</strong> local kitchens</span>
                </div>
            </div>
        </section>
    )
}

export default Header
