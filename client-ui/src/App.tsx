import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { CartProvider } from './context/CartContext';
import { CallbackProvider } from './context/CallbackContext';
import {
    AboutPage,
    ContactsPage,
    DeliveryPage,
    PrivacyPage,
    WarrantyPage,
} from './pages/InfoPages';
import { CartPage } from './pages/CartPage';
import { CashRegistrationPage } from './pages/CashRegistrationPage';
import { CatalogPage } from './pages/CatalogPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProductPage } from './pages/ProductPage';
import { ServicePage } from './pages/ServicePage';
import { ServiceRequestPage } from './pages/ServiceRequestPage';
import { ServiceStatusPage } from './pages/ServiceStatusPage';
import { SearchPage } from './pages/SearchPage';
import { SolutionsPage } from './pages/SolutionsPage';

export function App() {
    return (
        <BrowserRouter basename="/site">
            <CartProvider>
                <CallbackProvider>
                    <Routes>
                        <Route element={<Layout />}>
                            <Route index element={<HomePage />} />
                            <Route path="search" element={<SearchPage />} />
                            <Route
                                path="solutions"
                                element={<SolutionsPage />}
                            />
                            <Route path="catalog" element={<CatalogPage />} />
                            <Route
                                path="catalog/:slug"
                                element={<ProductPage />}
                            />
                            <Route path="cart" element={<CartPage />} />
                            <Route path="checkout" element={<CheckoutPage />} />
                            <Route path="service" element={<ServicePage />} />
                            <Route
                                path="service/request"
                                element={<ServiceRequestPage />}
                            />
                            <Route
                                path="service/status"
                                element={<ServiceStatusPage />}
                            />
                            <Route
                                path="cash-registration"
                                element={<CashRegistrationPage />}
                            />
                            <Route path="about" element={<AboutPage />} />
                            <Route path="delivery" element={<DeliveryPage />} />
                            <Route path="warranty" element={<WarrantyPage />} />
                            <Route path="contacts" element={<ContactsPage />} />
                            <Route path="privacy" element={<PrivacyPage />} />
                            <Route path="*" element={<NotFoundPage />} />
                        </Route>
                    </Routes>
                </CallbackProvider>
            </CartProvider>
        </BrowserRouter>
    );
}
