"""Transport-independent computation failures for browser and optional HTTP adapters."""
class CalculationError(ValueError):
    def __init__(self, status_code=422, detail='The calculation could not be evaluated.'):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)
