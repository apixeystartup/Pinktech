export function getErrorMessage(error) {
  if (error?.response?.data?.details) {
    const details = error.response.data.details;
    if (Array.isArray(details) && details.length > 0) {
      return details.map((d) => d.message || d.path?.join(".")).join("; ");
    }
  }
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  if (error?.message) {
    return error.message;
  }
  return "Something went wrong.";
}
