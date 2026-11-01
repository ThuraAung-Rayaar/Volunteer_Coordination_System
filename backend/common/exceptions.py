from rest_framework.exceptions import APIException

class DomainValidationError(APIException):
    status_code = 400
    default_detail = 'Domain validation failed.'
    default_code = 'invalid_domain_operation'

class GeofenceViolationError(APIException):
    status_code = 403
    default_detail = 'User location outside designated geofence radius.'
    default_code = 'outside_geofence'
