from django.contrib.auth.base_user import BaseUserManager
 

class UserManager(BaseUserManager):
    def create_user(self, phone_hash, display_name, password=None, **extra_fields):
        if not phone_hash:
            raise ValueError('The phone_hash must be set')
        if not display_name:
            raise ValueError('The display_name must be set')

        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        extra_fields.setdefault('is_admin', False)

        user = self.model(
            phone_hash=phone_hash,
            display_name=display_name,
            **extra_fields
        )
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()

        user.save(using=self._db)
        return user

    def create_superuser(self, phone_hash, display_name, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_admin', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        if extra_fields.get('is_admin') is not True:
            raise ValueError('Superuser must have is_admin=True.')

        return self.create_user(phone_hash, display_name, password=password, **extra_fields)
