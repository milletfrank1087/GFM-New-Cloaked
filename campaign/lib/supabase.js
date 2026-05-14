const { getRandomGradient, getInitials, formatTimeAgo } = require('./db/helpers');
const { createDonationToken } = require('./db/tokens');
const { getNextStore, createStore, updateStore, toggleStoreStatus, deleteStore, rebalanceStores } = require('./db/stores');
const { getStoreStats, getStoreDetail } = require('./db/stores-analytics');
const { getRecentRealDonations, getCampaignRealStats } = require('./db/campaigns');
const { getAllCustomers, getCustomerDetails, deleteCustomer, toggleCustomerStatus, updateCustomerNotes } = require('./db/customers');
const { getAllPayments, getPaymentDetails, getRecentFailures } = require('./db/payments');
const { getAdminDashboardStats, getTimeBasedAnalytics, getDeviceBrowserAnalytics, getDashboardOverview } = require('./db/analytics');

module.exports = {
  getRecentRealDonations,
  getCampaignRealStats,
  getAllCustomers,
  getCustomerDetails,
  getAllPayments,
  getPaymentDetails,
  getAdminDashboardStats,
  getRecentFailures,
  deleteCustomer,
  toggleCustomerStatus,
  updateCustomerNotes,
  getRandomGradient,
  getInitials,
  formatTimeAgo,
  getTimeBasedAnalytics,
  getDeviceBrowserAnalytics,
  getDashboardOverview,
  createDonationToken,
  getNextStore,
  getStoreStats,
  getStoreDetail,
  createStore,
  updateStore,
  toggleStoreStatus,
  deleteStore,
  rebalanceStores
};
