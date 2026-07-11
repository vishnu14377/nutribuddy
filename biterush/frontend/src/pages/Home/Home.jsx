import React, { useState } from 'react'
import Header from '../../components/Header/Header'
import ExploreMenu from '../../components/ExploreMenu/ExploreMenu'
import FoodDisplay from '../../components/FoodDisplay/FoodDisplay'
import AppDownload from '../../components/AppDownload/AppDownload'
import './Home.css'

const Home = () => {

  const [category,setCategory] = useState("All")

  return (
    <>
      <Header/>
      <section className="home-highlights" aria-label="BiteRush highlights">
        <div className="home-highlight">
          <span>Rush-ready picks</span>
          <p>Popular meals sorted for quick decisions and hot arrivals.</p>
        </div>
        <div className="home-highlight">
          <span>Nearby kitchens</span>
          <p>Fresh favorites from restaurants close enough to keep pace.</p>
        </div>
        <div className="home-highlight">
          <span>Easy repeats</span>
          <p>Find the dishes you love and reorder without slowing down.</p>
        </div>
      </section>
      <ExploreMenu setCategory={setCategory} category={category}/>
      <FoodDisplay category={category}/>
      <br></br>
      <br></br>
      {/* <AppDownload/> */}
    </>
  )
}

export default Home
