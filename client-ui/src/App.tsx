import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { WebSessionBoundary } from './components/WebSessionBoundary';
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
import { ServiceLandingPage } from './features/service/ServiceLandingPage';
import { ServiceRequestStartPage } from './features/service/ServiceRequestStartPage';
import { ServiceRequestListPage } from './features/service/ServiceRequestListPage';
import { ServiceRequestDetailPage } from './features/service/ServiceRequestDetailPage';
import { ServiceDraftPage } from './features/service/ServiceDraftEditor';
import { LegacyServiceStatusAdapter } from './features/service/LegacyServiceStatusAdapter';
import { SearchPage } from './pages/SearchPage';
import { SolutionsPage } from './pages/SolutionsPage';
import { OrganizationsPage } from './pages/OrganizationsPage';

export function App() {
    return (
        <BrowserRouter basename="/site">
            <CartProvider>
                <CallbackProvider>
                    <Routes>
                        <Route element={<Layout variant="service" />}>
                            <Route
                                path="service"
                                element={<ServiceLandingPage />}
                            />
                            <Route
                                path="service/request"
                                element={<ServiceRequestStartPage />}
                            />
                            <Route
                                path="service/requests"
                                element={<ServiceRequestListPage />}
                            />
                            <Route
                                path="service/requests/:id"
                                element={<ServiceRequestDetailPage />}
                            />
                            <Route
                                path="service/requests/:id/edit"
                                element={<ServiceDraftPage />}
                            />
                            <Route
                                path="service/status"
                                element={<LegacyServiceStatusAdapter />}
                            />
                            <Route
                                path="reference/service"
                                element={<Navigate to="/service" replace />}
                            />
                        </Route>
                        <Route
                            element={
                                <WebSessionBoundary>
                                    <Layout />
                                </WebSessionBoundary>
                            }
                        >
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
                            <Route
                                path="cash-registration"
                                element={<CashRegistrationPage />}
                            />
                            <Route
                                path="organizations"
                                element={<OrganizationsPage />}
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
