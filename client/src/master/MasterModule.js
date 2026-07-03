import React from 'react';
import Stock from '../components/Stock';
import Products from '../components/Products';
import Suppliers from '../components/Suppliers';
import CompanyProfile from '../components/CompanyProfile';
import Locations from '../components/Locations';
import Prices from '../components/Prices';
import SalesChannels from '../components/SalesChannels';
import SalesLocations from '../components/SalesLocations';
import ShipmentVendors from '../components/ShipmentVendors';
import Categories from '../components/Categories';
import Subcategories from '../components/Subcategories';
import GeminiImageGenerator from '../components/GeminiImageGenerator';
import './MasterModule.css';

function MasterModule({ subTab = 'products' }) {
  const renderPanel = () => {
    switch (subTab) {
      case 'products':
        return <Products />;
      case 'stock':
        return <Stock />;
      case 'suppliers':
        return <Suppliers />;
      case 'company-master':
        return <CompanyProfile />;
      case 'locations':
        return <Locations />;
      case 'prices':
        return <Prices />;
      case 'sales-channels':
        return <SalesChannels />;
      case 'sales-locations':
        return <SalesLocations />;
      case 'shipment-vendors':
        return <ShipmentVendors />;
      case 'categories':
        return <Categories />;
      case 'subcategories':
        return <Subcategories />;
      case 'gemini-image-generator':
        return <GeminiImageGenerator />;
      default:
        return <Products />;
    }
  };

  return <div className="master-module">{renderPanel()}</div>;
}

export default MasterModule;
