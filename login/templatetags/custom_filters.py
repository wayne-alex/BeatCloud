from django import template
from django.utils.dateparse import parse_datetime

register = template.Library()


@register.filter
def parse_datetime(value):
    if value and value != 'null':
        return parse_datetime(value)
    return None
